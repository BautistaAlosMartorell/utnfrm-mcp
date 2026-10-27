import * as cheerio from 'cheerio';

export type AutogestionAviso = { titulo: string; fecha?: string; texto: string };

/** Los avisos de la portada de Autogestión son "notas" (plugin WP Notes): título, fecha y párrafos. */
export function parseAutogestionAvisos(html: string): AutogestionAviso[] {
  const $ = cheerio.load(html);
  return $('.wp-notes-widget-list > li').map((_, li) => {
    const item = $(li);
    item.find('br').replaceWith('\n');
    const text = (selector: string) => item.find(selector).map((__, node) => $(node).text().replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()).get().filter(Boolean);
    const fecha = text('p.wp-notes-widget-date')[0];
    return {
      titulo: item.find('h5').first().text().replace(/\s+/g, ' ').trim(),
      ...(fecha ? { fecha } : {}),
      texto: text('p:not(.wp-notes-widget-date)').join('\n')
    };
  }).get().filter(aviso => aviso.titulo || aviso.texto);
}
