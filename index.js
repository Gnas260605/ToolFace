/* eslint-disable */
// index.js
const { postToFacebook } = require('./phase4_facebook_poster');

async function main() {
  console.log("Bắt đầu luồng ToolFace...");
  
  // Giả lập dữ liệu kịch bản từ Phase 2 (AI Processor) trả về
  const aiGeneratedContent = `🔥 TIN NÓNG TRONG NGÀY 🔥\n\nAI đang ngày càng thông minh và tự động hoá mọi thứ. Đây là bài test hệ thống ToolFace!\n\n#TechNews #ToolFace #Automation`;
  
  try {
    // Thay vì lưu ra file txt, đẩy thẳng lên Facebook
    await postToFacebook(aiGeneratedContent);
    console.log("Luồng tự động hoá hoàn tất!");
  } catch (error) {
    console.log("Luồng thất bại, vui lòng kiểm tra lại log.");
  }
}

main();
