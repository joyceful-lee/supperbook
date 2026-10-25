import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]}]}};
export default config;
