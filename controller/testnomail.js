const nodemailer = require("nodemailer");

exports.sendmail = async (req, res) => {
  const transportr = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
     
    },
    // tls: {
    //   rejectUnauthorized: false,
    // },
    // logger: true,
    // debug: true,
  });

  const option = {
    from: "network@nrru.ac.th", // ✅ ต้องใช้ from (ไม่ใช่ form)
    to: "chaitawat.no@nrru.ac.th", // ✅ หรือเปลี่ยนเป็น Gmail เพื่อลองส่งออก
    subject: "Test Node Send mail",
    html: `<table width="100%" style="font-family: 'Segoe UI', sans-serif; background-color: #f4f4f4; padding: 20px;">
  <tr>
    <td align="center">
      <table width="600" style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td align="center">
            <h2 style="color: #0d6efd; margin-bottom: 5px;">แจ้งเตือนการจองห้อง</h2>
            <p style="margin-top: 0; color: #555;">ระบบควบคุมการเข้าใช้งานห้องเรียน</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0;">
            <p><strong>เรียนคุณ</strong>เทสสสสส</p>
            <p>การจองห้องของคุณได้รับการอนุมัติเรียบร้อยแล้ว 🎉</p>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f1f1f1; padding: 15px; border-radius: 6px;">
            <p><strong>รายละเอียดการจอง:</strong></p>
            <ul style="padding-left: 20px; margin: 0;">
              <li><strong>วันที่:</strong> 12/12/2025</li>
              <li><strong>เวลา:</strong> 10:00 - 11:00</li>
              <li><strong>ห้อง:</strong> 27.05.03</li>
              <li><strong>กิจกรรม:</strong> สอน</li>
            </ul>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <p>กรุณาแสดง QR Code ด้านล่างเพื่อยืนยันสิทธิ์เข้าใช้งาน</p>
           
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top: 20px; font-size: 13px; color: #888;">
            <p>ระบบจองห้อง | NRRU Smart Access</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`,
  };

  transportr.sendMail(option, (err, info) => {
    if (err) {
      console.log("❌ Error:", err);
      return res.status(200).json({
        RespCode: 400,
        RespMessage: "bad",
        RespError: err,
      });
    } else {
      console.log("✅ Send:", info.response);
      return res.status(200).json({
        RespCode: 200,
        RespMessage: "good",
      });
    }
  });
};
