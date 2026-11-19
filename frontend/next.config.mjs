export default {
  async rewrites() {
    const api = new URL(process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').origin;
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};
