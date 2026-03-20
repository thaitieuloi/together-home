# Requirements & Implementation Status

Tài liệu này tổng hợp các yêu cầu chức năng và tiến độ hoàn thiện trên hai nền tảng: **Web (React)** và **Mobile (Flutter)**.

## 📊 Bảng so sánh chức năng

| Chức năng chính | Mô tả chi tiết | Web App | Mobile App | Ghi chú |
| :--- | :--- | :---: | :---: | :--- |
| **Hệ thống Auth** | Đăng nhập, Đăng ký, Đăng xuất | ✅ | ✅ | Cùng sử dụng Supabase Auth |
| **Quản lý Profile** | Cập nhật tên, ảnh đại diện | ✅ | ✅ | Đồng bộ qua bảng `profiles` |
| **Chia sẻ Vị trí** | Gửi tọa độ hiện tại lên server | ✅ | ✅ | Mobile có Foreground Service |
| **Theo dõi Realtime** | Xem vị trí thành viên trên bản đồ | ✅ | ✅ | Cập nhật tức thì qua Realtime |
| **Lịch sử Di chuyển** | Xem lại vệt đường đi trong quá khứ | ✅ | ✅ | Web có trình phát Playback tốt hơn |
| **Vùng an toàn** | Thiết lập tâm và bán kính vùng (Geofence) | ✅ | ✅ | Thông báo khi ra/vào vùng |
| **SOS Khẩn cấp** | Gửi/nhận SOS, hiển thị nổi bật | ✅ (Fix nổi bật) | 🏗️ (Cần icons lớn) | Đã chỉnh lề phải & hiệu ứng pulse trên Web |
| **Status trên Avatar** | Online(Xanh), Idle(Cam), Offline(Xám) | ✅ | ✅ | Đã đồng bộ qua Realtime |
| **Fix Logout status** | Trạng thái chuyển Offline khi thoát | ✅ | ✅ | ✅ Mới fix lỗi kẹt trạng thái "Gần đây" |
| **Hiển thị Pin** | Icon pin và % dung lượng | ✅ | ✅ | Đã đồng bộ chi tiết |
| **Sắp xếp thứ tự** | Thứ tự thành viên theo tên (A-Z) | ✅ | ✅ | Đảm bảo tính nhất quán giữa 2 app |
| **Map History Visual** | Xem vệt đường đi, điểm dừng, playback | ✅ (Playback) | 🏗️ (Đường kẻ) | Web có chế độ Playback mượt mà hơn |
| **Chi tiết Thành viên** | Xem địa chỉ, pin, tốc độ của người khác | ✅ | ✅ | Web dùng Action Sheet / Mobile dùng bottom sheet |

## ✨ Chi tiết UI/UX & Bug Fixes (Recent)

Dưới đây là các điểm lưu ý về trải nghiệm người dùng đã được cải thiện hoặc cần tối ưu:

### 1. Trải nghiệm SOS (Khẩn cấp)
*   **Web (Fixed)**: Nhãn SOS hiển thị to, màu đỏ, nhấp nháy (pulse), căn lề phải rõ ràng. Marker trên bản đồ có vòng tròn đỏ bao quanh.
*   **Mobile (Suggestion)**: Nút SOS nên đổi sang dạng Floating Action Button (FAB) nổi bật hơn hoặc có hiệu ứng khi người dùng mở app trong lúc có SOS active.

### 2. Định nghĩa & Đồng bộ trạng thái (User Status)

Hệ thống đã chuẩn hóa 3 trạng thái hoạt động chính, đồng bộ thời gian thực giữa Web và Mobile:
*   **Online (🟢 Xanh)**: Người dùng đã đăng nhập và **đang mở ứng dụng** (tiền cảnh - Foreground).
*   **Idle / Gần đây (🟡 Vàng)**: Người dùng ẩn ứng dụng (Background), chuyển sang app khác, hoặc đóng hẳn ứng dụng nhưng **vẫn đang chạy ngầm** để gửi vị trí.
*   **Offline (🔘 Xám)**: Chỉ hiển thị khi người dùng chủ động nhấn nút **Đăng xuất (Logout)** khỏi tài khoản.

**Các cải tiến & Fix mới nhất (2026-03-20):**
- **Sửa lỗi "Offline sau Login"**: Khắc phục tình trạng người dùng đăng nhập lại nhưng vẫn bị báo Offline do trễ đồng bộ. Đã bổ sung bước cập nhật trạng thái `online` chủ động ngay khi `signIn` thành công.
- **Sửa lỗi "Mất Idle"**: Khắc phục việc lệnh gửi vị trí ngầm vô tình đè lên trạng thái `Idle` khiến app luôn báo `Online`. Giờ đây trạng thái phụ thuộc hoàn toàn vào vòng đời ứng dụng (App Lifecycle).
- **Ổn định Realtime**: Web App đã được tối ưu để giữ một kết nối Realtime duy nhất, tránh việc nạp lại kênh liên tục gây mất dữ liệu trạng thái của thành viên.
- **Database Logic**: Bổ sung Foreign Key giữa `profiles` và `users` để tối ưu tốc độ truy vấn `JOIN` và độ ổn định của dữ liệu trên Mobile.

### 3. Hiển thị Lịch sử phát lại (Playback)
*   **Web (Feature)**: Hỗ trợ thanh kéo (Slider) để xem vị trí tại một thời điểm bất kỳ, hiển thị tốc độ di chuyển tại điểm đó.
*   **Mobile (Todo)**: Nên bổ sung khả năng nhấn vào từng điểm trên đường vẽ lịch sử để xem thông tin chi tiết (Thời gian, Pin, Tốc độ).

### 4. Nhất quán tên gọi
*   Sử dụng chung thuật ngữ: "Gần đây" (Idle) thay vì "Mới đây" hoặc "Hoạt động".
*   Sắp xếp danh sách thành viên theo bảng chữ cái để dễ tìm kiếm khi gia đình có đông người.


## 💡 Đề xuất nâng cấp (Suggestions for Future)

Dựa trên tình hình hiện tại, tôi đề xuất một số cải tiến để ứng dụng chuyên nghiệp hơn:

1.  **Offline Map Caching**:
    *   **Mobile**: Cho phép lưu bản đồ ngoại tuyến để tiết kiệm data và hoạt động khi sóng yếu.
2.  **Driving Behavior (Thông số lái xe)**:
    *   Sử dụng cảm biến gia tốc để cảnh báo nếu thành viên đang lái xe quá tốc độ hoặc phanh gấp (Mobile).
3.  **Low Battery Alert**:
    *   Tự động gửi thông báo cho cả gia đình khi pin của một thành viên xuống dưới 10% (Tự động hóa ở Backend/Edge Function).
4.  **Route Analytics (Phân tích lộ trình)**:
    *   Thống kê tổng quãng đường đã đi, các địa điểm thường xuyên ghé thăm (Web Admin).
5.  **Multi-Family Support**:
    *   Một người dùng có thể tham gia nhiều gia đình khác nhau (Ví dụ: Gia đình nội, Gia đình ngoại).

## 🛠️ Trạng thái kỹ thuật (Technical Debt)

*   [ ] **Background Geolocation**: Cần kiểm tra độ ổn định trên các dòng điện thoại Android khác nhau (đặc biệt là các dòng Oppo/Xiaomi có cơ chế kill app ngầm mạnh).
*   [ ] **Deep Linking**: Hỗ trợ mở app trực tiếp từ link mời tham gia gia đình gửi qua Zalo/SMS.
*   [ ] **Unit Testing**: Bổ sung bộ test cho các hàm tính toán khoảng cách và xử lý logic Realtime.

---
*Cập nhật lần cuối: 2026-03-20*
