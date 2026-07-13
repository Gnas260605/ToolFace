import './globals.css';

export const metadata = {
  title: 'NewsFlow AI - Nền tảng tổng hợp & đăng tin Facebook',
  description:
    'Nền tảng hỗ trợ tổng hợp, biên tập và đăng tin chuyên nghiệp lên Facebook Page dành cho các biên tập viên.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-[#070a13] text-[#f4f7fb] font-sans antialiased selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
