package com.smartsmoke.service;

import cn.smartjavaai.common.entity.DetectionResponse;
import cn.smartjavaai.common.enums.DeviceEnum;
import cn.smartjavaai.objectdetection.config.DetectorModelConfig;
import cn.smartjavaai.objectdetection.enums.DetectorModelEnum;
import cn.smartjavaai.objectdetection.model.DetectorModel;
import cn.smartjavaai.objectdetection.model.ObjectDetectionModelFactory;

/**
 * 火焰+烟雾视觉复核测试 —— YOLOv8n 模型
 * 用法：右键此类 → Run 'VisionTest.main()'
 * 确保 smart-smoke-models/best.onnx 和 synset.txt 已就位
 */
public class VisionTest {

    public static void main(String[] args) {
        String modelDir = "E:/java Pro/Smart-Smoke-Detection-System 1/smart-smoke-models";
        String modelPath = modelDir + "/best.onnx";
        String imagePath = modelDir + "/test-images/OIP (4).jpg";  // 改成你实际的图片名

        System.out.println("=== 火焰+烟雾检测视觉复核测试 ===");
        System.out.println("模型路径: " + modelPath);
        System.out.println("图片路径: " + imagePath);

        try {
            // 1. 配置模型
            DetectorModelConfig config = new DetectorModelConfig();
            config.setModelEnum(DetectorModelEnum.YOLOV8_CUSTOM_ONNX);
            config.setModelPath(modelPath);
            config.setThreshold(0.3f);
            config.setDevice(DeviceEnum.CPU);

            // 2. 加载模型
            System.out.println("\n正在加载模型...");
            long t0 = System.currentTimeMillis();
            DetectorModel detector = ObjectDetectionModelFactory.getInstance().getModel(config);
            System.out.println("模型加载成功! 耗时: " + (System.currentTimeMillis() - t0) + "ms");

            // 3. 推理
            System.out.println("\n正在检测...");
            long t1 = System.currentTimeMillis();
            DetectionResponse response = detector.detect(imagePath);
            long elapsed = System.currentTimeMillis() - t1;

            // 4. 输出结果
            if (response == null || response.getDetectionInfoList() == null
                    || response.getDetectionInfoList().isEmpty()) {
                System.out.println("检测完成: 未检出任何对象, 耗时: " + elapsed + "ms");
            } else {
                System.out.println("检出 " + response.getDetectionInfoList().size() + " 个对象, 耗时: " + elapsed + "ms");
                for (var d : response.getDetectionInfoList()) {
                    System.out.printf("  类别: %-10s  置信度: %.2f%%\n",
                            d.getObjectDetInfo().getClassName(),
                            d.getScore() * 100);
                }
            }

            System.out.println("\n=== 测试完成 ===");

        } catch (Exception e) {
            System.err.println("测试失败: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
