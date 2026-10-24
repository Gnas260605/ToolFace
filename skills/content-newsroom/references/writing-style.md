# Văn phong & cấu trúc bài đăng

Mục tiêu: đọc như một admin/biên tập viên sắc sảo đang kể lại sự việc — chân thực, gần gũi, gãy gọn — chứ không như máy viết. Người đọc mạng xã hội lướt rất nhanh và nhận ra "văn AI" chỉ sau một câu; khi đó họ lướt qua và tương tác giảm.

## Chống văn phong AI

Tránh các mở đầu và chuyển ý sáo rỗng. Danh sách dưới đây cũng nằm trong `DEFAULT_AI_SLOP` của `verify_draft.py`, nên dùng chúng sẽ bị chặn:

- "Trong thế giới ngày nay…", "Trong bối cảnh…", "Không thể phủ nhận rằng…"
- "Đó là minh chứng cho…", "Một bức tranh toàn cảnh…", "Hãy cùng chúng tôi điểm qua…"
- "Không chỉ là… mà còn là…", "Một câu chuyện cảm động lòng người…"
- "Cuộc sống đôi khi mang đến những thử thách…"
- Cảm thán giả tạo mở đầu tiêu đề: "TUYỆT VỜI!", "CHẤN ĐỘNG!", "ĐÁNG CHÚ Ý!", "SỐC!"

Thay vào đó: giật tít bằng **chính chi tiết đắt giá hoặc nghịch lý** của sự việc (con số, nhân vật, hành động, địa danh). Dùng ngôn ngữ đời thường, cô đọng, giàu hình ảnh; không văn vở, không lên gân dạy đời.

Không phóng đại vượt quá fact sheet để câu view. Giật tít bằng chi tiết thật thì bền; giật tít bằng điều sai thì mất page.

## Cấu trúc bài Facebook

1. **Tiêu đề** — in hoa, dưới 90 ký tự, đánh thẳng vào điểm đắt giá nhất.
   Ví dụ tốt: `CHÀNG TRAI 24 TUỔI BÁN VÉ SỐ ĐỖ THỦ KHOA ĐẠI HỌC Y`
2. **Hook** — câu đầu vào thẳng bối cảnh/nghịch cảnh. Không rào đón.
3. **Thân bài** — đoạn 1–2 câu ngắn, ngắt dòng thoáng. Nêu chi tiết cụ thể: tuổi, diễn biến, hoàn cảnh, phát ngôn trực tiếp (chỉ trích dẫn câu có trong fact sheet). Emoji theo `emojiPolicy` của thương hiệu (mặc định 1–2 emoji ở ý nhấn).
4. **Vì sao đáng quan tâm** — một đoạn ngắn về ý nghĩa hoặc góc nhìn thực tế. Đây là phần "giá trị biên tập" khiến bài không chỉ là bản chép lại — đừng bỏ.
5. **Câu hỏi thảo luận / lời chúc** — tự nhiên, mời bình luận tự nguyện. Không "comment 1 để…", không câu like.
6. **Dòng nguồn** — `Nguồn: <tên báo/kênh>`.
7. **Hashtag** — 4–6 hashtag có nghĩa, ưu tiên hashtag mặc định của thương hiệu.

## Theo loại tin

- **Tin nóng / tai nạn / pháp lý**: giữ trung tính, không suy đoán nguyên nhân, không nêu tên nạn nhân là trẻ vị thành niên, không kết luận ai có lỗi khi cơ quan chức năng chưa kết luận.
- **Tin đồn / chuyển nhượng**: nói rõ mức độ xác nhận ngay trong hook ("Theo …, chưa có xác nhận chính thức").
- **Kết quả thể thao**: tỉ số, cầu thủ ghi bàn, phút — giữ đúng tuyệt đối.
- **Câu chuyện nhân văn**: kể bằng chi tiết, để chi tiết tự gây xúc động; đừng tự gắn nhãn "cảm động".

## Caption ngắn / Threads

Rút gọn còn tiêu đề (không cần in hoa) + 2–4 câu + nguồn + 2–3 hashtag.
