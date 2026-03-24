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
| **Map History V2** | Tự động tách Chuyến đi/Điểm dừng, Playback | ✅ (Premium UI) | 🏗️ (Đang làm) | Web có UI Glassmorphism & Non-modal |
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

### 3. Hiển thị Lịch sử phát lại (Location History V2)
*   **Web (New Standard)**: 
    *   **Giao diện Glassmorphism**: Sử dụng hiệu ứng kính mờ (vibrant glass), độ trong suốt cao để không che khuất bản đồ.
    *   **Non-modal Interaction**: Sidebar lịch sử không được khóa (modal=false). Người dùng có thể vừa xem danh sách lịch sử vừa cuộn/thu phóng bản đồ hoặc chọn thành viên khác.
    *   **Trip Detection**: Tự động phân loại "Chuyến đi" (Trip) và "Điểm dừng" (Stay/Stop) dựa trên tốc độ và thời gian.
    *   **Dynamic Island Control**: Bộ điều khiển Playback dạng thanh nổi (floating bar) hiện đại, hỗ trợ tua nhanh 2x, 4x, 8x.
    *   **Dynamic Layout Adjustment**: Khi bảng Lịch sử (420px) mở, các khung khác (Chat, Thông báo) tự động dịch chuyển sang trái (`right-[444px]`) để tránh chồng lấp.
*   **Mobile (Todo)**: 
    *   Cần cập nhật logic tách Trip/Stay tương tự Web để đảm bảo tính nhất quán dữ liệu.
    *   Bổ sung khả năng nhấn vào từng điểm trên đường vẽ lịch sử để xem thông tin chi tiết (Thời gian, Pin, Tốc độ).

### 4. Logic tương tác đa bảng (Multi-Panel Interaction Rules)

Để đảm bảo trải nghiệm tập trung và tránh xung đột giao diện, Web App áp dụng các quy tắc sau:
*   **Highlight Sidebar**: Khi một thành viên được chọn (mở Action Sheet hoặc xem Lịch sử), thẻ của họ trong Sidebar sẽ luôn có viền xanh nổi bật (`border-primary`) để định vị ngữ cảnh.
*   **Nguyên tắc "Cùng người - Cộng dồn" (Same Member - Additive)**: 
    *   Nếu thao tác trên **cùng một thành viên**: Cho phép mở đồng thời nhiều bảng (Ví dụ: vừa mở Action Sheet vừa mở Chat hoặc Lịch sử). Các bảng này sẽ hỗ trợ lẫn nhau thay vì tự đóng cái này mở cái kia.
*   **Nguyên tắc "Khác người - Dọn dẹp" (Different Member - Clean Swap)**: 
    *   Nếu nhấn chọn một **thành viên khác** trong danh sách: Hệ thống tự động đóng toàn bộ các bảng đang mở của người cũ (Chat, Lịch sử, Action Sheet) để giải phóng màn hình và bắt đầu ngữ cảnh mới cho người vừa chọn.
*   **Nút chức năng Global (Top-right)**: Các nút Bell (Thông báo), History (Lịch sử chung), Shield (Vùng an toàn), Bug (Logs) hoạt động theo cơ chế **Mutually Exclusive** (chỉ một cái được mở tại một thời điểm). Khi mở bất kỳ cái nào trong số này, bảng Action Sheet của thành viên cũng sẽ tự động đóng lại để ưu tiên tính năng hệ thống.
*   **Animated Exit**: Mọi khung bảng điều khiển phải hỗ trợ hiệu ứng trượt ra (`animate-exit`) kể cả khi bị đóng cưỡng ép từ Component cha (Dashboard), đảm bảo sự mượt mà về thị giác.

### 5. Nhất quán tên gọi
*   Sử dụng chung thuật ngữ: "Vừa xong" (Recently/Idle) thay vì "Hoạt động".
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
*Cập nhật lần cuối: 2026-03-24*
