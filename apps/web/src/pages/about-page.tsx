import { Link } from 'react-router-dom';
import { PageTitle } from '../components/ui';

const metrics = [
  {
    icon: '⚡',
    name: 'CC Level',
    shortName: 'CCL',
    note: 'Năng lực dài hạn',
    formula: 'Mỗi bài: tăng tối đa 4 CCL',
    detail:
      'Bắt đầu từ 800. Mỗi bài rated Accepted lần đầu cộng một mức tăng dương theo chênh lệch giữa rating bài và CCL trước bài đó. Mức tăng tối đa 4 CCL/bài; phần vượt quá CCL +500 không làm điểm tăng thêm, nhờ vậy một bài bất thường không thể kéo năng lực lên quá nhanh.',
  },
  {
    icon: '◆',
    name: 'CC Point',
    shortName: 'CCP',
    note: 'Tổng thành tích tích luỹ',
    formula: 'Mỗi bài: 0,25–12,50 CCP',
    detail:
      'Một bài rated hợp lệ nhận từ 0,25 đến 12,50 CCP theo đường cong tăng mượt: bài càng khó so với CCL trước lúc giải thì thưởng càng cao. Bài quá dễ vẫn có điểm nhỏ; độ khó vượt CCL +500 không tiếp tục khuếch đại thưởng.',
  },
  {
    icon: '◈',
    name: 'CC Balance',
    shortName: 'CCB',
    note: 'Số dư dùng để đổi quà',
    formula: 'CCB tăng cùng CCP · giảm khi đổi quà',
    detail:
      'Mỗi hoạt động làm tăng CCP cũng tăng CCB đúng bằng số điểm đó. Khi đổi quà, chỉ CCB giảm; CCP vẫn giữ nguyên để phản ánh tổng thành tích bạn từng đạt được.',
  },
  {
    icon: '🔥',
    name: 'Streak',
    shortName: 'Chuỗi',
    note: 'Nhịp luyện tập liên tục',
    formula: '1 → tối đa 4 CCP mỗi ngày',
    detail:
      'Mỗi ngày có bài mới Accepted sẽ nhận một lần thưởng: ngày 1 là 1 CCP, sau đó tăng 0,15 mỗi ngày, đạt mốc 7 ngày được thêm 0,10 và tối đa 4 CCP/ngày. Điểm vào cả CCP lẫn CCB ngay sau đồng bộ. Linh vật có thể nối tối đa 3 ngày nhưng ngày cứu không sinh điểm.',
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
    detail: 'Hệ thống xếp lịch đọc lịch sử để dựng CCL. Bài cũ không phát CCP hoặc CCB hồi tố.',
  },
  {
    time: 'Mỗi 15 phút',
    title: 'Đang Online',
    detail: 'Áp dụng khi học sinh có hoạt động trên Cầy Cốt trong 60 phút gần nhất.',
  },
  {
    time: 'Mỗi 30 phút',
    title: 'Vừa hoạt động',
    detail: 'Áp dụng khi lần hoạt động gần nhất cách đây từ 60 đến 120 phút.',
  },
  {
    time: 'Khoảng 24 giờ',
    title: 'Đang Offline',
    detail: 'Áp dụng khi đã quá 120 phút chưa hoạt động trên Cầy Cốt.',
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
        eyebrow="CÙNG CẦY ĐỀU · CÙNG TIẾN BỘ"
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

      <nav className="about-anchor-nav" aria-label="Nội dung trang Giới thiệu">
        <a href="#tong-quan">Tổng quan</a>
        <a href="#cach-tinh">Các chỉ số</a>
        <a href="#bat-dau">Bắt đầu</a>
        <a href="#dong-bo">Đồng bộ</a>
        <a href="#kham-pha">Tính năng & nguyên tắc</a>
      </nav>

      <section className="about-hero panel" id="tong-quan">
        <div className="about-hero-copy">
          <span className="about-kicker">LUYỆN CODE CÓ MỤC TIÊU · TIẾN BỘ CÓ DẤU ẤN</span>
          <h2>Mỗi bài giải là một bước tiến. Mỗi ngày bền bỉ là một dấu mốc đáng tự hào.</h2>
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

      <section className="about-section-heading" id="cach-tinh">
        <span className="about-section-index">01</span>
        <div>
          <p className="eyebrow">HIỂU ĐÚNG CÁC CHỈ SỐ</p>
          <h2>Bốn chỉ số, bốn vai trò rõ ràng</h2>
        </div>
        <p>
          Nhìn CCL để biết năng lực, CCP để biết thành tích, CCB để đổi quà và Streak để giữ nhịp
          học.
        </p>
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
            <span className="about-metric-formula">{metric.formula}</span>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="panel about-start-panel" id="bat-dau">
        <div className="about-section-heading compact">
          <span className="about-section-index">02</span>
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

      <section className="about-section-heading" id="dong-bo">
        <span className="about-section-index">03</span>
        <div>
          <p className="eyebrow">BÀI GIẢI ĐƯỢC GHI NHẬN KHI NÀO?</p>
          <h2>Đồng bộ tự động theo trạng thái hoạt động</h2>
        </div>
        <p>
          Đang dùng hệ thống thì cập nhật nhanh hơn; khi offline, lịch đồng bộ được giãn để dùng hợp
          lý giới hạn Codeforces.
        </p>
      </section>

      <section className="about-sync-layout">
        <article className="panel about-sync-intro">
          <p className="eyebrow">QUY TRÌNH GHI NHẬN</p>
          <h2>Từ Accepted tới điểm số</h2>
          <p>
            Cầy Cốt kiểm tra các tài khoản đến hạn mỗi 30 giây. Khi lượt đồng bộ bắt đầu, hệ thống
            đọc dữ liệu Codeforces, nhận diện bài mới rồi cập nhật CCL, CCP, CCB và Streak ngay
            trong lượt xử lý đó.
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

      <section className="about-section-heading" id="kham-pha">
        <span className="about-section-index">04</span>
        <div>
          <p className="eyebrow">TÍNH NĂNG & NGUYÊN TẮC</p>
          <h2>Một nơi để học, theo dõi và được ghi nhận</h2>
        </div>
        <p>
          Các công cụ được tổ chức quanh hồ sơ học sinh, dữ liệu có minh chứng và lịch sử rõ ràng.
        </p>
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
              Bài rated cá nhân làm tăng CCL, CCP và CCB. Bài unrated không tăng CCL hay nhận CCP
              của bài, nhưng vẫn có thể ghi nhận ngày Streak và nhận đúng một khoản thưởng Streak.
              Nộp lại bài đã giải không được tính lần hai.
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
