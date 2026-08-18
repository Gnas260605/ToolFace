import './globals.css';

export const metadata = {
  title: 'ToolFace AI — Nền tảng tự động hóa nội dung Facebook',
  description:
    'Nền tảng hỗ trợ tổng hợp, biên tập và đăng tin chuyên nghiệp lên Facebook Page dành cho các biên tập viên.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface-base text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
