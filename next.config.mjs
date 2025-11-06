import path from 'node:path';
import Module from 'node:module';

const typesDir = path.resolve(process.cwd(), 'types');
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${typesDir}${path.delimiter}${process.env.NODE_PATH}`
  : typesDir;
Module._initPaths();

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias['iconv-lite'] = path.resolve(process.cwd(), 'lib/iconv-lite-stub.js');
    return config;
  }
};

export default nextConfig;
