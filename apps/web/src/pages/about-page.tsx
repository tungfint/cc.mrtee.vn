import { Link } from 'react-router-dom';
import { PageTitle } from '../components/ui';

const metrics = [
  {
    icon: '⚡',
    name: 'CC Level',
    shortName: 'CCL',
    note: 'Năng lực dài hạn',
    detail:
      'Bắt đầu từ 800. Mỗi bài rated được Accepted lần đầu đều giúp CCL tăng; bài ngang hoặc cao hơn trình độ tăng nhiều hơn, bài dễ hơn vẫn tăng nhưng rất ít. Cận trên độ khó được tính là CCL +500 để hạn chế một bài bất thường làm lệch năng lực.',
  },
  {
    icon: '◆',
    name: 'CC Point',
    shortName: 'CCP',
    note: 'Tổng thành tích tích luỹ',
    detail:
      'Ghi nhận điểm đã kiếm được trong suốt hành trình. Một bài rated hợp lệ nhận khoảng 0,25–12,50 CCP tuỳ độ khó so với CCL trước bài đó. Thưởng Streak và điểm do giáo viên ghi nhận cũng được cộng vào CCP.',
  },
  {
    icon: '◈',
    name: 'CC Balance',
    shortName: 'CCB',
    note: 'Số dư dùng để đổi quà',
    detail:
      'Mỗi hoạt động làm tăng CCP cũng tăng CCB đúng bằng số điểm đó. Khi đổi quà, chỉ CCB giảm; CCP vẫn giữ nguyên để phản ánh tổng thành tích bạn từng đạt được.',
  },
  {
    icon: '🔥',
    name: 'Streak',
    shortName: 'Chuỗi',
    note: 'Nhịp luyện tập liên tục',
    detail:
      'Một ngày được ghi nhận khi có ít nhất một bài mới Accepted theo múi giờ Việt Nam. Khi chuỗi kết thúc, thưởng Streak được cộng vào cả CCP và CCB. Có thể hi sinh linh vật để nối tối đa 3 ngày bỏ lỡ.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Kết nối Codeforces',
    detail: 'Nhập đúng handle Codeforces trong trang Tài khoản.',
  },
  {
    number: '02',
    title: 'Xác minh tài khoản',
    detail: 'Giáo viên hoặc Admin xác nhận handle thực sự thuộc về học sinh.',
  },
  {
    number: '03',
    title: 'Giải bài như bình thường',
    detail: 'Làm bài trực tiếp trên Codeforces; hệ thống tự đọc kết quả Accepted.',
  },
  {
    number: '04',
    title: 'Theo dõi & đổi thưởng',
    detail: 'Xem tiến bộ, bảng xếp hạng, thành tựu và dùng CCB để đổi quà.',
  },
];

const syncCadence = [
  {
    time: 'Gần như ngay',
    title: 'Lần đầu xác minh',
    detail:
      'Hệ thống xếp lịch đọc lịch sử để dựng CCL. Bài cũ không phát CCP hoặc CCB hồi tố.',
  },
  {
    time: 'Khoảng 2 giờ',
    title: 'Đang luyện tập',
    detail: 'Áp dụng khi tài khoản có hoạt động Codeforces trong 7 ngày gần nhất.',
  },
  {
    time: 'Khoảng 6 giờ',
    title: 'Hoạt động gần đây',
    detail: 'Áp dụng khi lần hoạt động gần nhất cách đây từ 7 đến 30 ngày.',
  },
  {
    time: 'Khoảng 24 giờ',
    title: 'Ít hoạt động',
    detail: 'Áp dụng khi chưa có dữ liệu gần đây hoặc đã nghỉ luyện tập trên 30 ngày.',
  },
];

const features = [
  {
    icon: '◎',
    title: 'Hồ sơ học sinh có minh chứng',
    detail:
      'Xem bài đã giải, link Codeforces, lịch sử thay đổi CCL/CCP/CCB, Streak, quà và danh hiệu trên một hồ sơ thống nhất.',
  },
  {
    icon: '▥',
    title: 'Bảng xếp hạng linh hoạt',
    detail:
      'So sánh theo CC Level, CC Point, CC Balance hoặc Streak; xem toàn hệ thống, từng lớp và chia sẻ bằng link công khai.',
  },
  {
    icon: '✦',
    title: 'Đổi quà & sưu tầm linh vật',
    detail:
      'Dùng CC Balance đổi quà, tiền thưởng, danh hiệu hoặc linh vật. Mỗi giao dịch đều có trạng thái và lịch sử rõ ràng.',
  },
  {
    icon: '◫',
    title: 'Vinh danh cá nhân',
    detail:
      'Tạo ảnh thành tích theo cấp bậc, số liệu thật, danh hiệu và linh vật đã sở hữu để lưu hoặc chia sẻ.',
  },
  {
    icon: '⌁',
    title: 'Gợi ý bài tiếp theo',
    detail:
      'Vùng rating đề xuất dựa trên trung bình 5 bài rated gần nhất, giúp chọn thử thách vừa sức thay vì chỉ chạy theo số lượng.',
  },
  {
    icon: '⚑',
    title: 'Minh bạch & chống bất thường',
    detail:
      'Mỗi bài chỉ tính một lần. Hoạt động bất thường được gắn cảnh báo để giáo viên kiểm tra, nhưng điểm hợp lệ vẫn được ghi nhận ngay.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page">
      <PageTitle
        eyebrow="GIỚI THIỆU CẦY CỐT"
        title="Nỗ lực nhìn thấy được. Tiến bộ chứng minh được."
        detail="Cầy Cốt MrTee.VN biến hành trình luyện Codeforces thành những chỉ số dễ hiểu, hồ sơ có minh chứng và phần thưởng có ý nghĩa — để mỗi bài toán đều trở thành một bước tiến rõ ràng."
        action={
          <div className="about-title-actions">
            <Link className="button-secondary" to="/leaderboard">
              Xem bảng xếp hạng
            </Link>
            <Link className="button-primary" to="/account">
              Kết nối Codeforces →
            </Link>
          </div>
        }
      />

      <section className="about-hero panel">
        <div className="about-hero-copy">
          <span className="about-kicker">CODEFORCES GAMIFICATION TRACKER</span>
          <h2>Không chỉ đếm số bài. Cầy Cốt ghi nhận cả năng lực, sự bền bỉ và hành trình trưởng thành.</h2>
          <p>
            Mục tiêu của hệ thống là giúp học sinh duy trì thói quen luyện tập, chọn bài phù hợp và
            nhìn thấy tiến bộ bằng dữ liệu thật từ Codeforces. Giáo viên có công cụ theo dõi lớp,
            khích lệ đúng lúc và vận hành phần thưởng minh bạch.
          </p>
          <div className="about-hero-points" aria-label="Nguyên tắc của hệ thống">
            <span>✓ Dữ liệu từ Codeforces</span>
            <span>✓ Mỗi bài chỉ ghi nhận một lần</span>
            <span>✓ Mọi thay đổi điểm đều có lịch sử</span>
          </div>
        </div>
        <div className="about-system-card" aria-label="Chu trình hoạt động">
          <div className="about-system-orbit" aria-hidden>
            <span>CCL</span>
            <span>CCP</span>
            <span>CCB</span>
            <strong>CC</strong>
          </div>
          <div>
            <span className="about-system-label">Một chu trình khép kín</span>
            <strong>Giải bài → Ghi nhận → Tiến bộ → Đổi thưởng</strong>
            <p>Thành tích không biến mất khi đổi quà; chỉ số năng lực và số dư luôn tách biệt.</p>
          </div>
        </div>
      </section>

      <section className="about-section-heading">
        <div>
          <p className="eyebrow">BỘ CHỈ SỐ CỐT LÕI</p>
          <h2>Bốn con số, bốn góc nhìn khác nhau</h2>
        </div>
        <p>Không một chỉ số đơn lẻ nào quyết định toàn bộ sự tiến bộ của học sinh.</p>
      </section>

      <section className="about-metric-grid">
        {metrics.map((metric) => (
          <article className="panel about-metric" key={metric.name}>
            <div className="about-metric-top">
              <span className="about-metric-icon" aria-hidden>
                {metric.icon}
              </span>
              <span className="about-metric-code">{metric.shortName}</span>
            </div>
            <h3>{metric.name}</h3>
            <strong>{metric.note}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel about-start-panel">
        <div className="about-section-heading compact">
          <div>
            <p className="eyebrow">BẮT ĐẦU RẤT ĐƠN GIẢN</p>
            <h2>Từ tài khoản Codeforces tới hồ sơ tiến bộ</h2>
          </div>
          <span className="about-section-number">4 bước</span>
        </div>
        <div className="about-steps">
          {steps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-sync-layout">
        <article className="panel about-sync-intro">
          <p className="eyebrow">KHI NÀO BÀI ĐƯỢC CẬP NHẬT?</p>
          <h2>Đồng bộ tự động theo nhịp hoạt động</h2>
          <p>
            Cầy Cốt kiểm tra các tài khoản đến hạn mỗi 30 giây. Khi job bắt đầu, hệ thống đọc dữ
            liệu Codeforces, nhận diện bài mới rồi cập nhật CCL, CCP, CCB và Streak ngay trong lượt
            xử lý đó.
          </p>
          <div className="about-manual-sync">
            <span aria-hidden>↻</span>
            <div>
              <strong>Cần cập nhật sớm hơn?</strong>
              <p>
                Học sinh có thể nhấn “Cập nhật Codeforces” mỗi 120 giây. Admin có thể đồng bộ một
                tài khoản, một lớp hoặc toàn hệ thống.
              </p>
            </div>
          </div>
          <small>
            Codeforces giới hạn lưu lượng nên các yêu cầu được xếp hàng, tối thiểu 2,2 giây cho mỗi
            lượt gọi API. Khi đông người, kết quả có thể cần thêm vài phút.
          </small>
        </article>
        <div className="about-cadence-list">
          {syncCadence.map((item, index) => (
            <article className="panel" key={item.title}>
              <span className="about-cadence-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.time}</strong>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section-heading">
        <div>
          <p className="eyebrow">TÍNH NĂNG NỔI BẬT</p>
          <h2>Một nơi để học, theo dõi và được ghi nhận</h2>
        </div>
        <p>Thiết kế cho học sinh, giáo viên, lớp học và cả những người muốn theo dõi hành trình.</p>
      </section>

      <section className="about-feature-grid">
        {features.map((feature) => (
          <article className="panel about-feature" key={feature.title}>
            <span aria-hidden>{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.detail}</p>
          </article>
        ))}
      </section>

      <section className="about-rules">
        <article className="panel about-rule-card">
          <span className="about-rule-icon" aria-hidden>
            ✓
          </span>
          <div>
            <p className="eyebrow">BÀI NÀO ĐƯỢC GHI NHẬN?</p>
            <h2>Accepted lần đầu của một bài mới</h2>
            <p>
              Bài rated cá nhân làm tăng CCL, CCP và CCB. Bài unrated vẫn có thể tính hoạt động và
              Streak nhưng không sinh điểm năng lực hoặc điểm thưởng. Nộp lại bài đã giải không
              được tính lần hai.
            </p>
          </div>
        </article>
        <article className="panel about-rule-card">
          <span className="about-rule-icon" aria-hidden>
            ⛨
          </span>
          <div>
            <p className="eyebrow">MINH BẠCH & CÔNG BẰNG</p>
            <h2>Điểm có nguồn, giao dịch có dấu vết</h2>
            <p>
              Điểm của từng bài dùng CCL ngay trước lần giải đó. Đổi quà không làm mất CCP. Mọi lần
              cộng, trừ, hoàn điểm hay điều chỉnh đều được lưu để kiểm tra khi cần.
            </p>
          </div>
        </article>
      </section>

      <section className="about-cta panel">
        <div>
          <p className="eyebrow">SẴN SÀNG BẮT ĐẦU?</p>
          <h2>Mỗi bài Accepted hôm nay là một bằng chứng cho phiên bản tốt hơn của ngày mai.</h2>
          <p>Kết nối Codeforces, chọn một bài vừa sức và bắt đầu xây hành trình của riêng bạn.</p>
        </div>
        <Link className="button-primary" to="/account">
          Mở tài khoản →
        </Link>
      </section>
    </div>
  );
}
