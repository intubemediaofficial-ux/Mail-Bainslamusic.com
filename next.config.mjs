/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { instrumentationHook: true, serverComponentsExternalPackages: ["playwright", "imapflow", "mailparser", "nodemailer"] },
};

export default nextConfig;
