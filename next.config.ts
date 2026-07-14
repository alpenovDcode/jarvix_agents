import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Явный алиас: плагин tsconfig-paths ненадёжен на пути с кириллицей/пробелом
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(process.cwd(), 'src')
    return config
  },
}

export default nextConfig
