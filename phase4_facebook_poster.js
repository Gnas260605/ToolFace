/* eslint-disable */
require('dotenv').config();
const axios = require('axios');

/**
 * Hàm đăng bài tự động lên Facebook Page
 * @param {string} content - Nội dung kịch bản AI đã xử lý
 * @returns {Promise<object>} Kết quả trả về từ Facebook API
 */
async function postToFacebook(content) {
  const pageId = process.env.FB_PAGE_ID;
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;

  try {
    const response = await axios.post(url, {
      message: content,
      access_token: accessToken,
    });
    console.log('✅ Đăng bài thành công! Post ID:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('❌ Lỗi khi đăng bài lên Facebook:');
    if (error.response) {
      console.error(error.response.data.error.message);
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

module.exports = { postToFacebook };
