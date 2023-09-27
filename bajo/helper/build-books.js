import path from 'path'
import matter from 'gray-matter'

const recs = ['book', 'section', 'page']
const rec = {}
for (const r of recs) {
  rec[r] = []
}

function getTitleFromPath (item) {
  const [prefix, ...params] = item.split('-')
  if (!isNaN(parseInt(prefix[0]))) return params.join('-')
  return item
}

function trimLevels (file, dir) {
  file = file.replace(dir, '')
  const parts = file.split('/')
  for (const i in parts) {
    const [, ...items] = parts[i].split('-')
    parts[i] = items.join('-')
  }
  return parts.join('/')
}

async function getPages (book) {
  const { importPkg, titleize, readConfig } = this.bajo.helper
  const { doctypes } = this.bajoWebBook.helper
  const { find, merge, concat } = await importPkg('lodash-es')
  const [fs, fastGlob] = await importPkg('fs-extra', 'fast-glob')
  const files = (await fastGlob(`${book.dir}/**/*`)).sort()
  const pages = []
  const sections = []
  for (const file of files) {
    let id = book.id + trimLevels(file, book.dir)
    const [level, ...bases] = path.basename(file).split('-')
    const [sectionLevel] = path.basename(path.dirname(file)).split('-')
    id = `${path.dirname(id)}/${bases.join('-')}`
    const ext = path.extname(id)
    const asset = !doctypes.includes(ext)
    if (!asset) id = id.slice(0, id.length - ext.length)
    const sectionId = path.dirname(id)
    let extraMatter = {}
    if (ext === '.md') {
      const md = await fs.readFile(file, 'utf8')
      extraMatter = matter(md).data
      // TODO: we might need the excerp from parsed matter
    }
    // sections
    if (sectionId !== book.id && !find(sections, { id: sectionId })) {
      const title = titleize(getTitleFromPath(path.basename(sectionId)))
      const extra = await readConfig(`${path.dirname(file)}/.${path.basename(sectionId)}.*`, { ignoreError: true })
      sections.push(merge({
        id: sectionId,
        bookId: book.id,
        level: sectionLevel,
        title
      }, extra))
      const parentId = path.dirname(sectionId)
      pages.push(merge({
        id: sectionId,
        title,
        file,
        level: sectionLevel,
        asset: false,
        section: true,
        sectionId: parentId === book.id ? undefined : parentId,
        bookId: book.id
      }, extra))
    }
    // pages
    const extra = await readConfig(`${path.dirname(file)}/.${path.basename(file, ext)}.*`, { ignoreError: true })
    pages.push(merge({
      id,
      title: titleize(getTitleFromPath(path.basename(file, ext))),
      asset,
      section: false,
      file,
      level,
      sectionId,
      bookId: book.id
    }, extra, extraMatter))
  }
  rec.section = concat(rec.section, sections)
  rec.page = concat(rec.page, pages)
}

/*
async function updateLevel (book) {
  const { importPkg } = this.bajo.helper
  const { orderBy, find, map, filter, findIndex } = await importPkg('lodash-es')
  let plevels
  let lastId
  const pages = orderBy(filter(rec.page, { bookId: book.id, asset: false }), ['id'])
  for (const i in pages) {
    const p = pages[i]
    const [,,, ...levels] = p.id.split('/')
    const prev = find(pages, { id: lastId })
    let level
    if (prev) {
      [,,, ...plevels] = prev.id.split('/')
      const pitems = prev.level.split('.')
      level = []
      for (const i in levels) {
        if (plevels[i] === levels[i]) level.push(pitems[i])
        else level.push((parseInt(pitems[i]) || 0) + 1)
      }
      level = level.join('.')
    } else {
      level = map(levels, l => 1).join('.')
    }
    const sidx = findIndex(rec.section, { id: p.id })
    if (sidx > -1) rec.section[sidx].level = level
    const pidx = findIndex(rec.page, { id: p.id })
    rec.page[pidx].level = level
    lastId = p.id
  }
}
*/

async function save () {
  const { pascalCase } = this.bajo.helper
  const { recordClear, recordCreate } = this.bajoDb.helper
  const opts = { skipHook: true }
  /*
  for (const b of rec.book) {
    await updateLevel.call(this, b)
  }
  */

  for (const r of recs) {
    const repo = pascalCase(`web book ${r}`)
    await recordClear(repo, opts)
    for (const item of rec[r]) {
      await recordCreate(repo, item, opts)
    }
  }
}

async function buildBooks (progress) {
  const { readConfig, eachPlugins, importPkg } = this.bajo.helper
  const { merge, omit } = await importPkg('lodash-es')
  await eachPlugins(async function ({ file, plugin, dir, alias }) {
    const title = path.basename(file)
    const book = {
      id: `/${alias}/${title}`,
      title,
      plugin,
      dir: file
    }
    const extra = await readConfig(`${file}/.${path.basename(file)}.*`, { ignoreError: true })
    merge(book, omit(extra, ['plugin', 'dir']))
    rec.book.push(book)
    await getPages.call(this, book)
    await save.call(this)
  }, { glob: { pattern: 'book/*', onlyDirectories: true } })
}

export default buildBooks
