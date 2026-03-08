

## Plan: Hoàn thiện Location Tracking

### Vấn đề hiện tại

1. **Realtime quá chậm & tốn tài nguyên**: Mỗi lần có INSERT vào `user_locations`, `useRealtimeLocations` trigger full refetch (gọi lại profiles + locations cho TẤT CẢ members) - rất lãng phí. Debounce 5s chỉ giảm tần suất nhưng vẫn N+1 queries.

2. **`useFamily` có N+1 query problem**: Với mỗi member, gọi riêng lẻ `profiles` + `user_locations` = 2N queries thay vì 2 queries.

3. **Không có upsert pattern**: Mỗi lần tracking đều INSERT row mới, bảng `user_locations` sẽ phình to rất nhanh (mỗi user ~2880 rows/ngày). Không có cơ chế cleanup.

4. **Accuracy filter thiếu**: Đang ghi nhận location với accuracy 25000m (25km!) - dữ liệu vô nghĩa nhưng vẫn lưu vào DB.

5. **Không có battery-aware tracking**: Web luôn poll 30s, không phân biệt foreground/background.

6. **Map không update realtime mượt**: Marker nhảy đột ngột thay vì smooth transition.

7. **Thiếu "last seen" indicator**: Không biết location có còn fresh hay đã cũ (offline).

---

### Giải pháp

#### 1. Thêm bảng `latest_locations` (upsert pattern)
- Tạo bảng mới `latest_locations` với UNIQUE constraint trên `user_id` để upsert
- Giữ `user_locations` cho history, nhưng `latest_locations` luôn chỉ có 1 row/user
- Realtime subscribe vào `latest_locations` thay vì `user_locations` - giảm noise

#### 2. Tối ưu `useLocationTracking`
- **Accuracy filter**: Bỏ qua location có accuracy > 100m (configurable)
- **Speed-based interval**: Nếu di chuyển nhanh (>5km/h) -> poll 15s, đứng yên -> 60s
- **Battery-aware**: Dùng `document.visibilityState` để giảm tracking khi tab background
- **Batch write**: Upsert vào `latest_locations` + insert vào `user_locations` trong 1 operation
- **Retry logic**: Nếu insert fail (mất mạng), queue lại và retry

#### 3. Tối ưu `useFamily` - loại bỏ N+1
- Dùng 1 query join thay vì N queries riêng lẻ
- Tách location fetching ra khỏi family loading

#### 4. Tối ưu `useRealtimeLocations`
- Subscribe trực tiếp vào `latest_locations` thay vì refetch toàn bộ
- Payload từ realtime đã chứa lat/lng mới -> cập nhật state trực tiếp, không cần query lại
- Filter theo family members' user_ids

#### 5. Cleanup cron - tự động xóa location cũ
- Tạo database function + pg_cron job xóa `user_locations` cũ hơn 30 ngày
- Hoặc dùng scheduled edge function

#### 6. UI improvements
- Hiển thị accuracy circle trên map (vòng tròn mờ quanh marker)
- "Last seen" badge: xanh (<5 phút), vàng (5-30 phút), đỏ (>30 phút)
- Smooth marker animation khi vị trí thay đổi

---

### Technical Details

**Migration SQL:**
```sql
-- Bảng latest_locations (1 row per user, upsert)
CREATE TABLE public.latest_locations (
  user_id uuid PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  heading double precision,
  battery_level double precision,
  is_moving boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.latest_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies mirroring user_locations
CREATE POLICY "Users can upsert own location"
  ON public.latest_locations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Family members can view latest locations"
  ON public.latest_locations FOR SELECT
  TO authenticated
  USING (is_family_member(auth.uid(), user_id));

-- Enable realtime on latest_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.latest_locations;

-- Cleanup function for old history
CREATE OR REPLACE FUNCTION public.cleanup_old_locations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM user_locations WHERE timestamp < now() - interval '30 days';
END;
$$;
```

**Files to modify:**
- `src/hooks/useLocationTracking.tsx` - Complete rewrite with accuracy filter, speed-based interval, visibility API, upsert to `latest_locations`
- `src/hooks/useRealtimeLocations.tsx` - Direct payload update instead of refetch
- `src/hooks/useFamily.tsx` - Batch query, use `latest_locations`
- `src/components/FamilyMap.tsx` - Accuracy circle, freshness indicator, smooth transitions
- `src/components/FamilySidebar.tsx` - Last seen status badge

**New files:**
- `src/hooks/useLocationState.ts` - Centralized location state management with realtime

