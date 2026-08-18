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
      'Tổng điểm thành tích bạn đã tích lũy từ bài giải, thử thách và điều chỉnh hợp lệ. CC Point không bị trừ khi đổi quà.',
  },
  {
    icon: '◈',
    name: 'CC Balance',
    detail:
      'Số dư hiện có để đổi quà. Khi gửi yêu cầu đổi quà, CC Balance giảm nhưng CC Point vẫn được giữ nguyên.',
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
  ['4', 'Tích lũy & đổi quà', 'Nâng CC Level, giữ Streak và dùng CC Balance để chọn phần quà.'],
];

export default function AboutPage() {
  return (
    <>
      <PageTitle
        eyebrow="WELCOME TO CẦY CODE"
        title="Biến mỗi bài Accepted thành một bước tiến"
        detail="Cầy Code MrTee.vn giúp học sinh nhìn thấy năng lực, sự bền bỉ và thành quả luyện tập Codeforces bằng những chỉ số rõ ràng, minh bạch và dễ hiểu."
        action={
          <Link className="button-primary" to="/account">
            Kết nối Codeforces
          </Link>
        }
      />

      <section className="about-hero panel">
        <div>
          <p className="eyebrow">MỤC TIÊU</p>
          <h2>Luyện đúng nhịp, hiểu đúng năng lực, ghi nhận đúng nỗ lực</h2>
          <p>
            Hệ thống đồng bộ các bài giải cá nhân từ Codeforces và chỉ ghi nhận lần Accepted đầu
            tiên của mỗi bài. Độ khó bài toán góp phần phản ánh năng lực; điểm thưởng ghi nhận thành
            tích; chuỗi ngày cho thấy sự đều đặn. Nhờ vậy, học sinh biết mình đang tiến bộ ở đâu và
            cần duy trì điều gì.
          </p>
        </div>
        <div className="about-callout">
          <span>Nguyên tắc</span>
          <strong>Giải thật · Ghi nhận đúng · Tiến bộ bền vững</strong>
          <p>Mọi thao tác cộng, trừ, xác minh và đổi quà đều có lịch sử để đối soát.</p>
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
          <p className="eyebrow">BẠN NÊN BIẾT</p>
          <h2>Codeforces và màu tài khoản</h2>
          <p>
            Handle trên trang chủ được tô màu theo rating Codeforces đã đồng bộ. Nếu bạn đổi handle
            sau khi đã xác minh, yêu cầu mới cần Admin duyệt để bảo vệ dữ liệu thành tích. Bạn vẫn
            có thể tham gia hệ thống dù chưa được xếp vào lớp nào.
          </p>
        </article>
        <article className="panel p-6">
          <p className="eyebrow">CÔNG BẰNG</p>
          <h2>Khi dữ liệu cần điều chỉnh</h2>
          <p>
            CC Level, CC Point và Streak tạo nên ba góc nhìn khác nhau; không một chỉ số đơn lẻ nào
            quyết định toàn bộ sự tiến bộ. Hãy báo Giáo viên/Admin nếu handle sai hoặc dữ liệu chưa
            đồng bộ, và không chia sẻ mật khẩu cho người khác.
          </p>
        </article>
      </section>
    </>
  );
}
