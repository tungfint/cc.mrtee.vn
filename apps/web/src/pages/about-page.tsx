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
      'Ví điểm dùng để đổi quà. Điểm có thể đến từ bài giải hợp lệ, thử thách hoặc thưởng của Giáo viên/Admin.',
  },
  {
    icon: '🏆',
    name: 'CC Current',
    detail:
      'Điểm thi đua trong mùa hiện tại. Khi mùa kết thúc, hệ thống lưu xếp hạng và trao danh hiệu tương ứng.',
  },
  {
    icon: '🔥',
    name: 'Streak',
    detail: 'Số ngày luyện tập liên tiếp có bài giải hợp lệ, tính theo múi giờ Asia/Ho_Chi_Minh.',
  },
];

const steps = [
  ['1', 'Kết nối Codeforces', 'Nhập đúng handle Codeforces trong trang Tài khoản.'],
  ['2', 'Được xác minh', 'Giáo viên hoặc Admin xác nhận handle thuộc về bạn.'],
  ['3', 'Đồng bộ bài giải', 'Hệ thống đọc submission và thông tin rating từ Codeforces.'],
  ['4', 'Tích lũy & đổi quà', 'Theo dõi tiến bộ, thi đua theo mùa và dùng CC Point đổi quà.'],
];

export default function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="WELCOME TO CẦY CODE"
        title="Học đều hơn, thấy rõ tiến bộ hơn"
        detail="Cầy Code MrTee.vn biến quá trình luyện Codeforces thành một hành trình có cấp độ, chuỗi ngày, mùa thi đua, thành tựu và phần quà."
        action={
          <Link className="button-primary" to="/account">
            Kết nối Codeforces
          </Link>
        }
      />

      <section className="about-hero panel">
        <div>
          <p className="eyebrow">MỤC TIÊU</p>
          <h2>Không chỉ đếm số bài — hệ thống ghi nhận chất lượng và sự bền bỉ</h2>
          <p>
            Mỗi bài Accepted đầu tiên của một bài toán cá nhân được ghi nhận một lần. Độ khó bài,
            nhịp luyện tập và chính sách của lớp cùng tạo nên bức tranh tiến bộ; bài team hoặc dữ
            liệu không đủ điều kiện sẽ không được tính như bài giải cá nhân.
          </p>
        </div>
        <div className="about-callout">
          <span>Nguyên tắc</span>
          <strong>Học thật · Giải thật · Tiến bộ thật</strong>
          <p>Mọi điều chỉnh đặc quyền đều có nhật ký để đảm bảo minh bạch.</p>
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
        <p className="eyebrow">BẮT ĐẦU TRONG 4 BƯỚC</p>
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
          <p className="eyebrow">BẠN NÊN BIẾT</p>
          <h2>Codeforces và màu tài khoản</h2>
          <p>
            Handle trên trang chủ được tô màu theo rating Codeforces đã đồng bộ. Nếu bạn đổi handle
            sau khi đã xác minh, tài khoản cũ vẫn hoạt động cho đến khi Admin duyệt yêu cầu mới.
          </p>
        </article>
        <article className="panel p-6">
          <p className="eyebrow">CÔNG BẰNG</p>
          <h2>Khi dữ liệu cần điều chỉnh</h2>
          <p>
            Hãy báo Giáo viên/Admin nếu handle sai, bài giải chưa đồng bộ hoặc CC Point chưa đúng.
            Không chia sẻ mật khẩu Cầy Code hay Codeforces cho người khác.
          </p>
        </article>
      </section>
    </>
  );
}
