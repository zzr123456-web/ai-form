// 临时脚本：批量检查翻译表覆盖率
// 调用 Geo Lookup 接口，把返回候选的 name/adm1/country 与当前翻译表对比
// 用法：node scripts/check-translation.mjs（要求代理 server.js 正在运行 :8787）
import http from 'node:http'

const API = 'http://localhost:8787/api/qw'

// 待检查关键词列表（覆盖常用搜索 + 截图里的刚果相关 + 常见洲）
const KEYWORDS = [
  '刚果', '非洲', 'Angola', 'Kinshasa', 'Paris', 'London', 'Tokyo',
  'New York', 'Mumbai', 'Sydney', 'Rio', 'Moscow', 'Nairobi',
  '开罗', '迪拜', '墨西哥', 'Hà Nội', 'Seoul', 'Toronto',
  '刚果共和国', 'Republic of the Congo', 'Congo',
]

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// —— 拷贝现有翻译表（与 qweatherUtils.js 保持同步）——
const COUNTRY_ZH = {}
const ADMIN1_ZH = {}
const CITY_ZH = {}

// 简单的 key 存在性检查
function hasCountry(name) { return !!COUNTRY_ZH[name] }
function hasAdmin1(name) { return !!ADMIN1_ZH[name] }
function hasCity(name) { return !!CITY_ZH[name] }

async function checkKeyword(kw) {
  const url = `${API}/v2/city/lookup?location=${encodeURIComponent(kw)}&number=5`
  const res = await fetchJson(url)
  const items = res.location || []
  const missingCountry = new Set()
  const missingAdmin1 = new Set()
  const missingCity = new Set()
  const hitCity = new Set()
  for (const it of items) {
    if (!hasCountry(it.country)) missingCountry.add(it.country)
    else hitCity.add(it.country)
    if (it.adm1 && !hasAdmin1(it.adm1)) missingAdmin1.add(it.adm1)
    if (!hasCity(it.name)) missingCity.add(it.name)
  }
  return { kw, total: items.length, missingCountry, missingAdmin1, missingCity }
}

async function main() {
  const all = []
  for (const kw of KEYWORDS) {
    try {
      all.push(await checkKeyword(kw))
    } catch (e) {
      all.push({ kw, error: e.message })
    }
  }
  // 聚合：把所有 unique 缺失项汇总输出
  const aggCountry = new Map() // 缺失国家 → 出现次数
  const aggAdmin1 = new Map()
  const aggCity = new Map()
  for (const r of all) {
    if (r.error) continue
    for (const c of r.missingCountry) aggCountry.set(c, (aggCountry.get(c) || 0) + 1)
    for (const a of r.missingAdmin1) aggAdmin1.set(a, (aggAdmin1.get(a) || 0) + 1)
    for (const c of r.missingCity) aggCity.set(c, (aggCity.get(c) || 0) + 1)
  }

  // 逐关键词打印命中/缺失
  console.log('\n========== 逐关键词详情 ==========')
  for (const r of all) {
    if (r.error) {
      console.log(`\n[${r.kw}] 调用失败: ${r.error}`)
      continue
    }
    console.log(`\n[${r.kw}] 共 ${r.total} 条候选`)
    if (r.missingCountry.size) console.log(`  ⚠ 国家未收录 (${r.missingCountry.size}):`, [...r.missingCountry].slice(0, 5).join(' | '))
    if (r.missingAdmin1.size) console.log(`  ⚠ 一级行政区未收录 (${r.missingAdmin1.size}):`, [...r.missingAdmin1].slice(0, 5).join(' | '))
    if (r.missingCity.size) console.log(`  ⚠ 城市名未收录 (${r.missingCity.size}):`, [...r.missingCity].slice(0, 5).join(' | '))
  }

  // 汇总
  console.log('\n========== 全局汇总（按出现频率排序） ==========')
  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
  console.log('\n[国家未收录] 总项数:', aggCountry.size)
  for (const [k, v] of sort(aggCountry).slice(0, 30)) console.log(`  ${v}× ${k}`)
  console.log('\n[一级行政区未收录] 总项数:', aggAdmin1.size)
  for (const [k, v] of sort(aggAdmin1).slice(0, 30)) console.log(`  ${v}× ${k}`)
  console.log('\n[城市未收录] 总项数:', aggCity.size)
  for (const [k, v] of sort(aggCity).slice(0, 40)) console.log(`  ${v}× ${k}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
