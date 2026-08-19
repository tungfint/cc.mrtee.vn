import { Link } from 'react-router-dom';
import { PageTitle } from '../components/ui';

const metrics = [
  {
    icon: '⚡',
    name: 'CC Level',
    detail:
      'Năng lực dài hạn được ước lượng từ độ khó các bài đã giải. CC Base là mức nền do Admin thiết lập, nên CC Level không thấp hơn mốc này.',
  },
  {
    icon: '◆',
    name: 'CC Point',
    detail:
      'Tổng thành tích tích luỹ từ bài giải, thưởng Streak và các ghi nhận hợp lệ. Mỗi lần được cộng CC Point, CC Balance cũng tăng tương ứng; CC Point không giảm khi đổi quà.',
  },
  {
    icon: '◈',
    name: 'CC Balance',
    detail:
      'Số dư hiện có để đổi quà. Khi gửi yêu cầu đổi quà, CC Balance giảm nhưng CC Point và lịch sử thành tích vẫn được giữ nguyên.',
  },
  {
    icon: '🔥',
    name: 'Streak',
    detail:
      'Số ngày liên tiếp có bài Accepted đầu tiên được ghi nhận theo múi giờ Việt Nam. Linh vật đã sở hữu có thể cứu tối đa 3 ngày bị thiếu.',
  },
];

const steps = [
  ['1', 'Kết nối Codeforces', 'Nhập đúng handle Codeforces trong trang Tài khoản.'],
  ['2', 'Được xác minh', 'Giáo viên hoặc Admin xác nhận handle thuộc về bạn.'],
  ['3', 'Đồng bộ bài giải', 'Hệ thống đọc submission và rating trực tiếp từ Codeforces.'],
  [
    '4',
    'Tích luỹ & đổi quà',
    'Nâng CC Level, nhận thưởng Streak và dùng CC Balance để đổi quà hoặc sưu tầm linh vật.',
  ],
];

export default function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="WELCOME TO CẦY CỐT"
        title="Biến sự bền bỉ thành những cột mốc đáng tự hào"
        detail="Cầy Cốt MrTee.VN ghi nhận hành trình luyện Codeforces bằng dữ liệu rõ ràng: bài đã giải, năng lực hiện tại, chuỗi ngày bền bỉ, điểm tích luỹ và những phần thưởng đã nhận."
        action={
          <Link className="button-primary" to="/account">
            Kết nối Codeforces
          </Link>
        }
      />

      <section className="about-hero panel">
        <div>
          <p className="eyebrow">MỤC TIÊU</p>
          <h2>Không chỉ đếm bài giải — hệ thống ghi nhận cả năng lực và sự bền bỉ</h2>
          <p>
            Hệ thống đồng bộ bài giải cá nhân từ Codeforces và chỉ tính lần Accepted đầu tiên của
            mỗi bài. CC Level phản ánh năng lực dài hạn; CC Point ghi nhận toàn bộ thành tích; CC
            Balance là số dư có thể sử dụng; Streak thể hiện thói quen luyện tập liên tục. Hồ sơ học
            sinh lưu bài đầu tiên mỗi ngày để mọi chuỗi đều có minh chứng rõ ràng.
          </p>
        </div>
        <div className="about-callout">
          <span>Nguyên tắc</span>
          <strong>Dữ liệu thật · Ghi nhận minh bạch · Tiến bộ bền vững</strong>
          <p>
            Mọi lần cộng điểm, đổi quà, hi sinh linh vật và điều chỉnh quản trị đều có lịch sử để
            đối soát.
          </p>
        </div>
      </section>

      <section className="about-metric-grid">
        {metrics.map((metric) => (
          <article className="panel about-metric" key={metric.name}>
            <span aria-hidden>{metric.icon}</span>
            <h2>{metric.name}</h2>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel mt-6 p-6">
        <p className="eyebrow">BẮT ĐẦU RẤT ĐƠN GIẢN</p>
        <div className="about-steps mt-5">
          {steps.map(([number, title, detail]) => (
            <article key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-rules mt-6">
        <article className="panel p-6">
          <p className="eyebrow">CODEFORCES</p>
          <h2>Mỗi kết quả đều có nguồn kiểm chứng</h2>
          <p>
            Màu tên và handle dựa trên rating Codeforces đã đồng bộ. Khi đổi handle, yêu cầu mới cần
            Admin duyệt để bảo vệ lịch sử. Học sinh vẫn có thể tham gia dù chưa thuộc lớp nào.
          </p>
        </article>
        <article className="panel p-6">
          <p className="eyebrow">CÔNG BẰNG</p>
          <h2>Ba chỉ số, ba góc nhìn khác nhau</h2>
          <p>
            CC Level cho biết năng lực, CC Point cho biết tổng thành tích, còn Streak cho biết sự
            đều đặn. Không một chỉ số đơn lẻ nào quyết định toàn bộ sự tiến bộ của học sinh.
          </p>
        </article>
      </section>

      <section className="panel mt-6 p-6">
        <p className="eyebrow">STREAK & LINH VẬT</p>
        <h2>Giữ nhịp luyện tập, nhưng vẫn có cơ hội sửa một lần bỏ lỡ</h2>
        <p>
          Khi có khoảng trống không quá 3 ngày giữa hai ngày giải bài, học sinh có thể hi sinh một
          linh vật cho mỗi ngày bị thiếu để nối chuỗi. Linh vật phải là quà đã được Admin xác nhận
          giao và mỗi cá thể chỉ sử dụng một lần. Khi chuỗi thực sự kết thúc, thưởng Streak được tự
          động cộng vào cả CC Point và CC Balance; chuỗi càng dài, mức thưởng theo ngày càng cao.
        </p>
      </section>
    </>
  );
}
