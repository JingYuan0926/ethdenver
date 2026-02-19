import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";
import fs from "fs";
import path from "path";
import os from "os";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { provider: providerAddress, model, dataset, trainingParams } = req.body;

  if (!providerAddress || !model) {
    return res
      .status(400)
      .json({ error: "provider and model are required" });
  }

  if (!dataset || !Array.isArray(dataset) || dataset.length === 0) {
    return res.status(400).json({
      error:
        "dataset is required (array of {instruction, input, output} objects)",
    });
  }

  let tmpDatasetPath = "";
  let tmpTrainingPath = "";

  try {
    const broker = await getComputeBroker();
    if (!broker.fineTuning) {
      return res
        .status(500)
        .json({ success: false, error: "Fine-tuning broker not available" });
    }

    // 1. Acknowledge provider if not already done
    const services = await broker.fineTuning.listService(true);
    const svc = services.find(
      (s) => s.provider.toLowerCase() === providerAddress.toLowerCase()
    );
    if (!svc) {
      return res
        .status(400)
        .json({ success: false, error: "Provider not found" });
    }
    if (!svc.teeSignerAcknowledged) {
      await broker.fineTuning.acknowledgeProviderSigner(providerAddress);
    }

    // 2. Write dataset to temp JSONL file
    const tmpDir = os.tmpdir();
    tmpDatasetPath = path.join(tmpDir, `0g-ft-dataset-${Date.now()}.jsonl`);
    const jsonlContent = dataset
      .map((item: Record<string, string>) => JSON.stringify(item))
      .join("\n");
    fs.writeFileSync(tmpDatasetPath, jsonlContent, "utf-8");

    // 3. Write training params to temp JSON file
    const defaultTrainingParams = {
      learning_rate: 1e-5,
      n_epochs: 3,
      batch_size: 1,
      ...(trainingParams || {}),
    };
    tmpTrainingPath = path.join(tmpDir, `0g-ft-params-${Date.now()}.json`);
    fs.writeFileSync(
      tmpTrainingPath,
      JSON.stringify(defaultTrainingParams),
      "utf-8"
    );

    // 4. Upload dataset to TEE
    const uploadResult = await broker.fineTuning.uploadDatasetToTEE(
      providerAddress,
      tmpDatasetPath
    );

    // 5. Create fine-tuning task
    const taskId = await broker.fineTuning.createTask(
      providerAddress,
      model,
      uploadResult.datasetHash,
      tmpTrainingPath
    );

    return res.status(200).json({
      success: true,
      taskId,
      datasetHash: uploadResult.datasetHash,
      model,
      provider: providerAddress,
      trainingParams: defaultTrainingParams,
      message: `Fine-tuning task created: ${taskId}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  } finally {
    // Cleanup temp files
    if (tmpDatasetPath && fs.existsSync(tmpDatasetPath)) {
      fs.unlinkSync(tmpDatasetPath);
    }
    if (tmpTrainingPath && fs.existsSync(tmpTrainingPath)) {
      fs.unlinkSync(tmpTrainingPath);
    }
  }
}
