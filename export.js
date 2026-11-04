/* Exportação do resultado da triagem: planilha .xlsx e PDF. Roda só no navegador do usuário. */
(function () {
  'use strict';

  var DISCLAIMER = 'Este resumo é uma triagem e não um diagnóstico. A avaliação cabe a um profissional do serviço, que pode chegar a outra conclusão.';
  var PROTOTYPE = 'Protótipo em teste: pesos e pontos de corte ainda não foram validados.';
  var SUPPORT = [['188', 'CVV, apoio emocional, 24 horas'], ['192', 'SAMU, emergência de saúde'], ['190', 'Polícia Militar, em caso de perigo causado por outra pessoa']];
  var CUTS = { moderate: 25, high: 50 };
  var BAR_SCALE_MAX = 30; /* maior peso entre os fatores: mesma escala para todas as barras */

  var COLORS = {
    primary: '3D569F', primarySoft: 'E6EBF8', track: 'DDE2EE', ink: '2B2E3A', muted: '565C6B', line: 'D9D5CB', zebra: 'F7F5F0', white: 'FFFFFF',
    baixo: 'DCF2E6', baixoInk: '1D5C3F', moderado: 'FDF0D5', moderadoInk: '6F4E00', alto: 'FCECE7', altoInk: 'B23A26'
  };

  function formatDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function ageAt(birth, on) {
    var b = birth.split('-').map(Number);
    var d = on.split('-').map(Number);
    var age = d[0] - b[0];
    if (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2])) age -= 1;
    return age;
  }

  function fmt(n) { return n.toFixed(1).replace('.', ','); }

  /* Nome do arquivo: "Nome - DD-MM-AAAA.ext", sem caracteres que os sistemas de arquivos recusam */
  function fileName(nome, dateIso, ext) {
    var clean = String(nome)
      .replace(/[\u0000-\u001f\u007f<>:"\/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
      .replace(/[. ]+$/, '')
      .replace(/^[. ]+/, '');
    return (clean || 'Triagem') + ' - ' + formatDate(dateIso).replace(/\//g, '-') + '.' + ext;
  }

  /* Reúne dados do paciente e resultado em uma estrutura única para os dois formatos. */
  function buildReport(patient, r, labels) {
    var age = ageAt(patient.nascimento, patient.dataTriagem);
    return {
      patientRows: [
        ['Nome', patient.nome],
        ['Data de nascimento', formatDate(patient.nascimento)],
        ['Idade na triagem', age + (age === 1 ? ' ano' : ' anos')],
        ['Data da triagem', formatDate(patient.dataTriagem)],
        ['Cartão SUS', patient.cns || ''],
        ['Telefone', patient.telefone || ''],
        ['Profissional responsável', patient.profissional || ''],
        ['Observações', patient.observacoes || '']
      ].filter(function (row) { return row[1] !== ''; }),
      fileBase: { nome: patient.nome, date: patient.dataTriagem },
      total: r.total,
      categoryKey: r.category,
      category: labels[r.category],
      categoryBySum: labels[r.categoryBySum],
      raisedByRule: r.raisedByRule,
      reasons: r.reasons,
      showSupport: r.showSupport,
      top: r.top.map(function (f) {
        return { label: f.factor.label, points: f.points, max: f.maxPoints, item: f.top.item.text, value: f.top.value };
      }),
      /* Todos os fatores, do que mais pontuou para o que menos pontuou */
      factors: r.factors.slice().sort(function (a, b) {
        return b.points - a.points || b.maxPoints - a.maxPoints || a.order - b.order;
      }).map(function (f) {
        return { label: f.factor.label, points: f.points, max: f.maxPoints };
      }),
      referral: [r.referral].concat(r.addons),
      answers: r.factors.reduce(function (rows, f) {
        return rows.concat(f.items.map(function (row) {
          return { factor: f.factor.label, text: row.item.text, source: row.item.source, value: row.value, weight: row.item.weight, points: row.points };
        }));
      }, [])
    };
  }

  /* ---------- Planilha .xlsx ---------- */

  function escapeXml(text) {
    /* Remove caracteres de controle, que deixam o XML inválido */
    return String(text)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function columnName(i) { return String.fromCharCode(65 + i); }

  var FONTS = {
    normal: '<sz val="11"/><color rgb="FF' + COLORS.ink + '"/>',
    bold: '<b/><sz val="11"/><color rgb="FF' + COLORS.ink + '"/>',
    muted: '<sz val="10"/><color rgb="FF' + COLORS.muted + '"/>',
    title: '<b/><sz val="18"/><color rgb="FFFFFFFF"/>',
    onPrimary: '<sz val="10"/><color rgb="FFFFFFFF"/>',
    section: '<b/><sz val="12"/><color rgb="FF' + COLORS.primary + '"/>',
    head: '<b/><sz val="11"/><color rgb="FFFFFFFF"/>',
    score: '<b/><sz val="26"/><color rgb="FF' + COLORS.ink + '"/>',
    baixo: '<b/><sz val="14"/><color rgb="FF' + COLORS.baixoInk + '"/>',
    moderado: '<b/><sz val="14"/><color rgb="FF' + COLORS.moderadoInk + '"/>',
    alto: '<b/><sz val="14"/><color rgb="FF' + COLORS.altoInk + '"/>'
  };
  var FONT_KEYS = Object.keys(FONTS);
  var FILL_KEYS = ['primary', 'primarySoft', 'zebra', 'baixo', 'moderado', 'alto'];

  /* Nome do estilo: [fonte, preenchimento, borda inferior, alinhamento, formato numérico] */
  var STYLES = {
    normal: ['normal'],
    text: ['normal', null, false, 'wrap'],
    label: ['bold', null, true, 'top'],
    value: ['normal', null, true, 'wrap'],
    muted: ['muted', null, false, 'wrap'],
    title: ['title', 'primary', false, 'middle'],
    subtitle: ['onPrimary', 'primary', false, 'wrap'],
    section: ['section', 'primarySoft', false, 'middle'],
    score: ['score', null, false, 'left', true],
    scoreLabel: ['muted', null, false, 'middle'],
    baixo: ['baixo', 'baixo', false, 'center'],
    moderado: ['moderado', 'moderado', false, 'center'],
    alto: ['alto', 'alto', false, 'center'],
    head: ['head', 'primary', false, 'centerWrap'],
    headLeft: ['head', 'primary', false, 'middle'],
    cell: ['normal', null, true, 'wrap'],
    cellNum: ['normal', null, true, 'centerTop'],
    cellDec: ['normal', null, true, 'centerTop', true],
    zebra: ['normal', 'zebra', true, 'wrap'],
    zebraNum: ['normal', 'zebra', true, 'centerTop'],
    zebraDec: ['normal', 'zebra', true, 'centerTop', true],
    total: ['bold', 'primarySoft', false, 'middle'],
    totalNum: ['bold', 'primarySoft', false, 'center'],
    totalDec: ['bold', 'primarySoft', false, 'center', true],
    referral: ['normal', 'baixo', false, 'wrap'],
    support: ['normal', 'alto', false, 'wrap'],
    supportHead: ['bold', 'alto', false, 'middle']
  };
  var STYLE_KEYS = Object.keys(STYLES);
  var S = {};
  STYLE_KEYS.forEach(function (k, i) { S[k] = i; });

  var ALIGN = {
    wrap: '<alignment wrapText="1" vertical="top"/>',
    top: '<alignment vertical="top"/>',
    middle: '<alignment vertical="center"/>',
    left: '<alignment horizontal="left" vertical="center"/>',
    center: '<alignment horizontal="center" vertical="center"/>',
    centerWrap: '<alignment horizontal="center" vertical="center" wrapText="1"/>',
    centerTop: '<alignment horizontal="center" vertical="top"/>'
  };

  function stylesXml() {
    var fonts = FONT_KEYS.map(function (k) { return '<font>' + FONTS[k] + '<name val="Calibri"/><family val="2"/></font>'; }).join('');
    var fills = FILL_KEYS.map(function (k) { return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + COLORS[k] + '"/><bgColor indexed="64"/></patternFill></fill>'; }).join('');
    var xfs = STYLE_KEYS.map(function (k) {
      var st = STYLES[k];
      var fill = st[1] ? FILL_KEYS.indexOf(st[1]) + 2 : 0;
      var align = st[3] ? ALIGN[st[3]] : '';
      return '<xf numFmtId="' + (st[4] ? 164 : 0) + '" fontId="' + FONT_KEYS.indexOf(st[0]) + '" fillId="' + fill + '" borderId="' + (st[2] ? 1 : 0) + '" xfId="0" applyFont="1"' +
        (fill ? ' applyFill="1"' : '') + (st[2] ? ' applyBorder="1"' : '') + (st[4] ? ' applyNumberFormat="1"' : '') + (align ? ' applyAlignment="1">' + align + '</xf>' : '/>');
    }).join('');
    return HEAD + '<styleSheet ' + NS_MAIN + '><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
      '<fonts count="' + FONT_KEYS.length + '">' + fonts + '</fonts>' +
      '<fills count="' + (FILL_KEYS.length + 2) + '"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + fills + '</fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF' + COLORS.line + '"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + STYLE_KEYS.length + '">' + xfs + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var NS_MAIN = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  var NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  /* Monta uma planilha linha a linha; células mescladas repetem o estilo para o preenchimento cobrir tudo. */
  function Sheet(widths) {
    this.widths = widths;
    this.rows = [];
    this.merges = [];
    this.totalWidth = widths.reduce(function (s, w) { return s + w; }, 0);
  }
  Sheet.prototype.add = function (cells, height) {
    this.rows.push({ cells: cells, height: height });
    return this.rows.length;
  };
  Sheet.prototype.blank = function (height) { return this.add([], height); };
  Sheet.prototype.span = function (text, style, height) {
    var cells = this.widths.map(function (_, i) { return { v: i === 0 ? text : '', s: style }; });
    var row = this.add(cells, height || this.lineHeight(text, this.totalWidth));
    this.merges.push('A' + row + ':' + columnName(this.widths.length - 1) + row);
    return row;
  };
  /* Linhas mescladas não ajustam a altura sozinhas: estima pela largura em caracteres */
  Sheet.prototype.lineHeight = function (text, width) {
    return Math.max(1, Math.ceil(String(text).length / (width * 1.05))) * 15 + 3;
  };
  Sheet.prototype.xml = function (extra) {
    extra = extra || {};
    var cols = this.widths.map(function (w, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }).join('');
    var body = this.rows.map(function (row, r) {
      var cells = row.cells.map(function (cell, c) {
        var ref = columnName(c) + (r + 1);
        if (cell.v === '' || cell.v === undefined) return '<c r="' + ref + '" s="' + cell.s + '"/>';
        if (typeof cell.v === 'number') return '<c r="' + ref + '" s="' + cell.s + '"><v>' + cell.v + '</v></c>';
        /* Texto vai sempre como inlineStr, então nunca é interpretado como fórmula */
        return '<c r="' + ref + '" s="' + cell.s + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(cell.v) + '</t></is></c>';
      }).join('');
      return '<row r="' + (r + 1) + '"' + (row.height ? ' ht="' + row.height + '" customHeight="1"' : '') + '>' + cells + '</row>';
    }).join('');
    var merges = this.merges.length ? '<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '';
    var pane = extra.freezeRow ? '<pane ySplit="' + extra.freezeRow + '" topLeftCell="A' + (extra.freezeRow + 1) + '" activePane="bottomLeft" state="frozen"/>' : '';
    return HEAD + '<worksheet ' + NS_MAIN + ' ' + NS_R + '><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<sheetViews><sheetView showGridLines="0" workbookViewId="0"' + (extra.selected ? ' tabSelected="1"' : '') + '>' + pane + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' + cols + '</cols><sheetData>' + body + '</sheetData>' + merges + (extra.conditional || '') +
      '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
      (extra.drawing ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';
  };

  function dataBar(range, max) {
    return '<conditionalFormatting sqref="' + range + '"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="num" val="0"/><cfvo type="num" val="' + max + '"/><color rgb="FFB9C6E8"/></dataBar></cfRule></conditionalFormatting>';
  }

  function chartSeries(idx, name, nameRef, catRef, valRef, cats, vals, color, labels) {
    var catPts = cats.map(function (c, i) { return '<c:pt idx="' + i + '"><c:v>' + escapeXml(c) + '</c:v></c:pt>'; }).join('');
    var valPts = vals.map(function (v, i) { return '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>'; }).join('');
    var dLbls = labels
      ? '<c:dLbls><c:numFmt formatCode="0.0" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1"><a:solidFill><a:srgbClr val="' + COLORS.ink + '"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr><c:dLblPos val="inBase"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
      : '';
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/><c:tx><c:strRef><c:f>' + nameRef + '</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + name + '</c:v></c:pt></c:strCache></c:strRef></c:tx>' +
      '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>' + dLbls +
      '<c:cat><c:strRef><c:f>' + catRef + '</c:f><c:strCache><c:ptCount val="' + cats.length + '"/>' + catPts + '</c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + valRef + '</c:f><c:numCache><c:formatCode>0.0</c:formatCode><c:ptCount val="' + vals.length + '"/>' + valPts + '</c:numCache></c:numRef></c:val></c:ser>';
  }

  function textProps(size, color) {
    return '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + size + '"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>';
  }

  function chartXml(factors, firstRow) {
    var last = firstRow + factors.length - 1;
    var catRef = 'Resumo!$A$' + firstRow + ':$A$' + last;
    var cats = factors.map(function (f) { return f.label; });
    return HEAD + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' + NS_R + '><c:roundedCorners val="0"/><c:chart>' +
      '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="pt-BR" sz="1200" b="1"><a:solidFill><a:srgbClr val="' + COLORS.ink + '"/></a:solidFill></a:rPr><a:t>Pontos obtidos por fator</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
      '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
      chartSeries(0, 'Máximo do fator', 'Resumo!$C$' + (firstRow - 1), catRef, 'Resumo!$C$' + firstRow + ':$C$' + last, cats, factors.map(function (f) { return f.max; }), COLORS.track, false) +
      chartSeries(1, 'Pontos obtidos', 'Resumo!$B$' + (firstRow - 1), catRef, 'Resumo!$B$' + firstRow + ':$B$' + last, cats, factors.map(function (f) { return f.points; }), COLORS.primary, false) +
      '<c:gapWidth val="60"/><c:overlap val="100"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>' +
      '<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="' + COLORS.line + '"/></a:solidFill></a:ln></c:spPr>' + textProps(1000, COLORS.ink) + '<c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
      '<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/><c:max val="' + BAR_SCALE_MAX + '"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="' + COLORS.line + '"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + textProps(900, COLORS.muted) + '<c:crossAx val="111111111"/><c:crosses val="max"/><c:crossBetween val="between"/><c:majorUnit val="5"/></c:valAx>' +
      '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>' + textProps(1000, COLORS.ink) + '</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }

  function drawingXml(fromRow, toRow, toCol) {
    return HEAD + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor>' +
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + fromRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + toCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + toRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Gráfico de pontos por fator" descr="Barras horizontais com os pontos obtidos e o máximo de cada fator. Os valores estão na tabela acima do gráfico."/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' + NS_R + ' r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
  }

  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* Arquivo ZIP sem compressão, que é o contêiner do .xlsx */
  function zipStore(files) {
    var encoder = new TextEncoder();
    var locals = [];
    var centrals = [];
    var offset = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
    var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };

    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = encoder.encode(file.text);
      var crc = crc32(data);
      /* versão 2.0, nomes em UTF-8, sem compressão, data fixa em 01/01/2000 */
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x2821), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = [].concat(u32(0x04034b50), common);
      locals.push(new Uint8Array(local), name, data);
      centrals.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });

    var centralSize = centrals.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
    var parts = locals.concat(centrals, [end]);
    var out = new Uint8Array(parts.reduce(function (s, p) { return s + p.length; }, 0));
    var pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  function buildXlsx(report) {
    var cell = function (v, s) { return { v: v, s: s }; };
    var resumo = new Sheet([34, 16, 16, 28]);
    var wideRest = 16 + 16 + 28;

    resumo.span('Triagem psicossocial', S.title, 32);
    resumo.span(PROTOTYPE, S.subtitle, 20);
    resumo.blank(8);

    resumo.span('Dados do paciente', S.section, 22);
    report.patientRows.forEach(function (row) {
      var r = resumo.add([cell(row[0], S.label), cell(row[1], S.value), cell('', S.value), cell('', S.value)], resumo.lineHeight(row[1], wideRest));
      resumo.merges.push('B' + r + ':D' + r);
    });
    resumo.blank(8);

    resumo.span('Resultado', S.section, 22);
    var catStyle = S[report.categoryKey];
    var scoreRow = resumo.add([cell(report.total, S.score), cell('de 100 pontos', S.scoreLabel), cell('Risco ' + report.category.toLowerCase(), catStyle), cell('', catStyle)], 40);
    resumo.merges.push('C' + scoreRow + ':D' + scoreRow);
    if (report.raisedByRule) {
      var why = 'Só pela soma, o risco seria ' + report.categoryBySum.toLowerCase() + '. Ele subiu por uma regra de atenção. ' + report.reasons.join(' ');
      resumo.span(why, S.text);
    }
    resumo.span('Pela soma: abaixo de ' + CUTS.moderate + ' é baixo, de ' + CUTS.moderate + ' até menos de ' + CUTS.high + ' é moderado, e a partir de ' + CUTS.high + ' é alto.', S.muted);
    resumo.blank(8);

    if (report.showSupport) {
      resumo.span('Apoio disponível agora', S.supportHead, 22);
      SUPPORT.forEach(function (line) { resumo.span(line[0] + ': ' + line[1], S.support, 18); });
      resumo.blank(8);
    }

    resumo.span('Sugestão de encaminhamento', S.section, 22);
    report.referral.forEach(function (line) { resumo.span(line, S.referral); });
    resumo.blank(8);

    resumo.span('Quanto cada fator pesou', S.section, 22);
    var headRow = resumo.add([cell('Fator', S.headLeft), cell('Pontos obtidos', S.head), cell('Máximo do fator', S.head), cell('Aproveitamento do fator', S.head)], 32);
    var firstFactor = headRow + 1;
    report.factors.forEach(function (f, i) {
      var pct = f.max ? Math.round((f.points / f.max) * 100) / 100 : 0;
      resumo.add([cell(f.label, i % 2 ? S.zebra : S.cell), cell(f.points, i % 2 ? S.zebraDec : S.cellDec), cell(f.max, i % 2 ? S.zebraDec : S.cellDec), cell(Math.round(pct * 100), i % 2 ? S.zebraNum : S.cellNum)], 18);
    });
    var lastFactor = firstFactor + report.factors.length - 1;
    resumo.blank(8);
    var chartStart = resumo.blank();
    for (var i = 1; i < 17; i++) resumo.blank();
    var chartEnd = chartStart + 16;
    resumo.blank(8);

    if (report.top.length) {
      resumo.span('Respostas de maior influência', S.section, 22);
      report.top.forEach(function (f) {
        var r = resumo.add([cell(f.label, S.label), cell(f.item + ' (resposta ' + f.value + ')', S.value), cell('', S.value), cell('', S.value)], resumo.lineHeight(f.item + ' (resposta ' + f.value + ')', wideRest));
        resumo.merges.push('B' + r + ':D' + r);
      });
      resumo.blank(8);
    }
    resumo.span(DISCLAIMER, S.muted);

    var respostas = new Sheet([24, 66, 30, 12, 8, 9]);
    respostas.add([cell('Fator', S.headLeft), cell('Pergunta', S.headLeft), cell('Origem', S.headLeft), cell('Resposta (0 a 10)', S.head), cell('Peso', S.head), cell('Pontos', S.head)], 34);
    report.answers.forEach(function (a, i) {
      var odd = i % 2 === 1;
      var lines = Math.max(1, Math.ceil(a.text.length / 66));
      respostas.add([
        cell(a.factor, odd ? S.zebra : S.cell), cell(a.text, odd ? S.zebra : S.cell), cell(a.source, odd ? S.zebra : S.cell),
        cell(a.value, odd ? S.zebraNum : S.cellNum), cell(a.weight, odd ? S.zebraNum : S.cellNum), cell(a.points, odd ? S.zebraDec : S.cellDec)
      ], lines * 15 + 4);
    });
    var lastAnswer = respostas.rows.length;
    respostas.add([cell('Total', S.total), cell('', S.total), cell('', S.total), cell('', S.total), cell(100, S.totalNum), cell(report.total, S.totalDec)], 22);

    var typeSheet = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
    var rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var relsNs = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
    return zipStore([
      { name: '[Content_Types].xml', text: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + typeSheet + '"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="' + typeSheet + '"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>' },
      { name: '_rels/.rels', text: HEAD + '<Relationships ' + relsNs + '><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: HEAD + '<workbook ' + NS_MAIN + ' ' + NS_R + '><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Respostas" sheetId="2" r:id="rId2"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: HEAD + '<Relationships ' + relsNs + '><Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + rel + '/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: stylesXml() },
      { name: 'xl/worksheets/sheet1.xml', text: resumo.xml({ selected: true, drawing: true, conditional: dataBar('D' + firstFactor + ':D' + lastFactor, 100) }) },
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', text: HEAD + '<Relationships ' + relsNs + '><Relationship Id="rId1" Type="' + rel + '/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet2.xml', text: respostas.xml({ freezeRow: 1, conditional: dataBar('D2:D' + lastAnswer, 10) }) },
      { name: 'xl/drawings/drawing1.xml', text: drawingXml(chartStart - 1, chartEnd - 1, 4) },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', text: HEAD + '<Relationships ' + relsNs + '><Relationship Id="rId1" Type="' + rel + '/chart" Target="../charts/chart1.xml"/></Relationships>' },
      { name: 'xl/charts/chart1.xml', text: chartXml(report.factors, firstFactor) }
    ]);
  }

  /* ---------- PDF ---------- */

  /* As fontes padrão do PDF cobrem Latin-1; o restante é trocado por equivalente simples. */
  function pdfText(text) {
    return String(text)
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
      .replace(/[^\u0009\u000a -~ -ÿ]/g, '?');
  }

  function buildPdf(report, JsPDF) {
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'Triagem psicossocial', subject: 'Triagem, não diagnóstico' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 15;
    var CW = W - 2 * M;
    var BOTTOM = H - 15;
    var y = M;

    var rgb = function (hex) { return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]; };
    function fill(hex) { doc.setFillColor.apply(doc, rgb(hex)); }
    function ink(hex) { doc.setTextColor.apply(doc, rgb(hex)); }
    function font(size, bold) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); }
    function lh(size) { return size * 0.42; }
    function wrap(text, width, size, bold) { font(size, bold); return doc.splitTextToSize(pdfText(text), width); }
    function box(x, top, w, h, hex, r) { fill(hex); doc.roundedRect(x, top, w, h, r === undefined ? 2.5 : r, r === undefined ? 2.5 : r, 'F'); }
    function room(h) { if (y + h > BOTTOM) { doc.addPage(); y = M; } }
    function lines(arr, x, top, size, bold, hex) {
      font(size, bold);
      ink(hex || COLORS.ink);
      arr.forEach(function (line, i) { doc.text(line, x, top + lh(size) * (i + 0.8)); });
      return arr.length * lh(size);
    }
    function heading(text, sub) {
      room(16);
      y += 5;
      lines([pdfText(text)], M, y, 12.5, true, COLORS.primary);
      y += 6;
      if (sub) {
        var s = wrap(sub, CW, 9);
        y += lines(s, M, y, 9, false, COLORS.muted) + 1.5;
      }
    }

    /* Cabeçalho */
    box(M, y, CW, 20, COLORS.primary);
    lines(['Triagem psicossocial'], M + 5, y + 3.5, 17, true, COLORS.white);
    lines([pdfText(PROTOTYPE)], M + 5, y + 12, 8.5, false, COLORS.white);
    y += 24;

    /* Dados do paciente: duas colunas; observações ocupam a linha inteira */
    var rows = report.patientRows.filter(function (r) { return r[0] !== 'Observações'; });
    var obs = report.patientRows.filter(function (r) { return r[0] === 'Observações'; })[0];
    var colW = (CW - 14) / 2;
    var layout = [];
    for (var i = 0; i < rows.length; i += 2) {
      var a = wrap(rows[i][1], colW, 10.5, true);
      var b = rows[i + 1] ? wrap(rows[i + 1][1], colW, 10.5, true) : [];
      layout.push({ a: rows[i], la: a, b: rows[i + 1], lb: b, h: 5 + Math.max(a.length, b.length || 1) * lh(10.5) + 2.5 });
    }
    var obsLines = obs ? wrap(obs[1], CW - 10, 10) : [];
    var patientH = 6 + layout.reduce(function (s, r) { return s + r.h; }, 0) + (obs ? 5 + obsLines.length * lh(10) + 2.5 : 0);
    box(M, y, CW, patientH, COLORS.primarySoft);
    var py = y + 3.5;
    layout.forEach(function (r) {
      lines([pdfText(r.a[0])], M + 5, py, 8.5, false, COLORS.muted);
      lines(r.la, M + 5, py + 4, 10.5, true);
      if (r.b) {
        lines([pdfText(r.b[0])], M + 9 + colW, py, 8.5, false, COLORS.muted);
        lines(r.lb, M + 9 + colW, py + 4, 10.5, true);
      }
      py += r.h;
    });
    if (obs) {
      lines([pdfText('Observações')], M + 5, py, 8.5, false, COLORS.muted);
      lines(obsLines, M + 5, py + 4, 10);
    }
    y += patientH + 4;

    /* Resultado: pontuação, categoria e régua com os pontos de corte */
    var why = report.raisedByRule ? wrap('Só pela soma, o risco seria ' + report.categoryBySum.toLowerCase() + '. Ele subiu por uma regra de atenção. ' + report.reasons.join(' '), CW - 72, 9) : [];
    var heroH = Math.max(34, 25 + why.length * lh(9) + 3);
    room(heroH);
    doc.setDrawColor.apply(doc, rgb(COLORS.line));
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, heroH, 2.5, 2.5, 'S');
    lines([pdfText('Pontuação')], M + 5, y + 4, 9, false, COLORS.muted);
    lines([fmt(report.total)], M + 5, y + 8.5, 30, true);
    lines(['de 100 pontos'], M + 5, y + 23, 9.5, false, COLORS.muted);

    var gx = M + 62;
    var gw = CW - 67;
    var key = report.categoryKey;
    var pill = pdfText('Categoria de risco: ' + report.category);
    font(11.5, true);
    var pillW = doc.getTextWidth(pill) + 8;
    box(gx, y + 3.5, pillW, 7.5, COLORS[key], 3.7);
    lines([pill], gx + 4, y + 5, 11.5, true, COLORS[key + 'Ink']);

    /* Régua: faixas rotuladas em texto, para a categoria não depender só da cor */
    var gy = y + 15.5;
    var gh = 3.2;
    var zone = function (from, to, hex, label) {
      fill(hex);
      doc.rect(gx + gw * from / 100, gy, gw * (to - from) / 100 - 0.4, gh, 'F');
      font(7.5);
      ink(COLORS.muted);
      doc.text(label, gx + gw * from / 100, gy + gh + 3);
    };
    zone(0, CUTS.moderate, COLORS.baixo, 'Baixo (0)');
    zone(CUTS.moderate, CUTS.high, COLORS.moderado, 'Moderado (' + CUTS.moderate + ')');
    zone(CUTS.high, 100, COLORS.alto, 'Alto (' + CUTS.high + ')');
    var mx = gx + gw * report.total / 100;
    fill(COLORS.ink);
    doc.rect(Math.min(mx, gx + gw - 0.7), gy - 1.1, 0.7, gh + 1.5, 'F');
    if (why.length) lines(why, gx, gy + gh + 5, 9, false, COLORS.muted);
    y += heroH + 4;

    /* Apoio, quando alguma resposta indica necessidade */
    if (report.showSupport) {
      var supH = 9 + SUPPORT.length * 5.2;
      room(supH);
      box(M, y, CW, supH, COLORS.alto);
      lines([pdfText('Apoio disponível agora')], M + 5, y + 3, 11, true, COLORS.altoInk);
      SUPPORT.forEach(function (s, idx) {
        var top = y + 8.5 + idx * 5.2;
        lines([s[0]], M + 5, top, 10.5, true);
        lines([pdfText(s[1])], M + 15, top, 10);
      });
      y += supH + 2;
    }

    /* Gráfico: barras horizontais de uma só cor, na mesma escala, com o valor escrito ao lado */
    heading('Quanto cada fator pesou', 'A barra escura mostra os pontos obtidos e o fundo claro, o máximo daquele fator.');
    var labelW = 46;
    var valueW = 25;
    var barX = M + labelW;
    var barW = CW - labelW - valueW;
    var rowH = 7;
    room(report.factors.length * rowH + 2);
    report.factors.forEach(function (f, idx) {
      var top = y + idx * rowH;
      var isTop = idx < 3 && f.points > 0;
      lines([pdfText(f.label)], M, top + 1, 9.5, isTop);
      box(barX, top + 1, barW * f.max / BAR_SCALE_MAX, 3.6, COLORS.track, 0.9);
      if (f.points > 0) box(barX, top + 1, Math.max(barW * f.points / BAR_SCALE_MAX, 1.8), 3.6, COLORS.primary, 0.9);
      font(9.5, isTop);
      ink(COLORS.ink);
      doc.text(fmt(f.points) + ' de ' + fmt(f.max), W - M, top + 3.9, { align: 'right' });
    });
    y += report.factors.length * rowH + 1;

    /* Encaminhamento */
    var refLines = report.referral.map(function (t) { return wrap(t, CW - 10, 10.5); });
    var refH = 5 + refLines.reduce(function (s, l) { return s + l.length * lh(10.5) + 1.5; }, 0);
    /* Título e caixa ficam sempre na mesma página */
    room(refH + 12);
    heading('Sugestão de encaminhamento');
    box(M, y, CW, refH, COLORS.baixo);
    var ry = y + 3;
    refLines.forEach(function (l) { ry += lines(l, M + 5, ry, 10.5) + 1.5; });
    y += refH + 3;

    var disc = wrap(DISCLAIMER, CW, 9);
    room(disc.length * lh(9));
    y += lines(disc, M, y, 9, false, COLORS.muted);

    /* Respostas: sempre em página própria, para a primeira ser o resumo */
    doc.addPage();
    y = M;
    lines(['Respostas'], M, y, 15, true, COLORS.primary);
    y += 8;

    var cPts = W - M - 2;
    var cWeight = cPts - 15;
    var cBarEnd = cWeight - 14;
    var cBarStart = cBarEnd - 22;
    var textW = cBarStart - M - 10;
    function tableHead() {
      box(M, y, CW, 7, COLORS.primary, 1.2);
      font(9, true);
      ink(COLORS.white);
      doc.text('Pergunta', M + 2, y + 4.7);
      doc.text('Resposta (0 a 10)', cBarStart, y + 4.7);
      doc.text('Peso', cWeight, y + 4.7, { align: 'right' });
      doc.text('Pontos', cPts, y + 4.7, { align: 'right' });
      y += 8;
    }
    tableHead();
    var last = null;
    report.answers.forEach(function (a) {
      var ls = wrap(a.text, textW, 9.5);
      var h = Math.max(ls.length * lh(9.5), 4.5) + 2.6;
      var need = h + (a.factor !== last ? 7 : 0);
      if (y + need > BOTTOM) { doc.addPage(); y = M; tableHead(); last = null; }
      if (a.factor !== last) {
        y += 1;
        lines([pdfText(a.factor)], M + 2, y + 0.8, 10, true, COLORS.primary);
        y += 5.2;
        last = a.factor;
      }
      lines(ls, M + 2, y + 1, 9.5);
      box(cBarStart, y + 1.5, 22, 2.2, COLORS.track, 0.6);
      if (a.value > 0) box(cBarStart, y + 1.5, Math.max(2.2 * a.value, 1.2), 2.2, COLORS.primary, 0.6);
      font(9.5, true);
      ink(COLORS.ink);
      doc.text(String(a.value), cBarEnd + 7, y + 3.5, { align: 'right' });
      font(9.5);
      doc.text(String(a.weight), cWeight, y + 3.5, { align: 'right' });
      doc.text(fmt(a.points), cPts, y + 3.5, { align: 'right' });
      y += h;
      doc.setDrawColor.apply(doc, rgb(COLORS.line));
      doc.setLineWidth(0.15);
      doc.line(M, y - 0.6, W - M, y - 0.6);
    });
    if (y + 9 > BOTTOM) { doc.addPage(); y = M; }
    y += 1;
    box(M, y, CW, 7.5, COLORS.primarySoft, 1.2);
    font(10, true);
    ink(COLORS.ink);
    doc.text('Total', M + 2, y + 5);
    doc.text('100', cWeight, y + 5, { align: 'right' });
    doc.text(fmt(report.total), cPts, y + 5, { align: 'right' });

    /* Rodapé */
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      font(8);
      ink(COLORS.muted);
      doc.text(pdfText('Triagem, não diagnóstico. Contém dados pessoais e de saúde: guarde em local seguro.'), M, H - 8);
      doc.text('Página ' + p + ' de ' + pages, W - M, H - 8, { align: 'right' });
    }
    return doc;
  }

  var api = { buildReport: buildReport, buildXlsx: buildXlsx, buildPdf: buildPdf, fileName: fileName, ageAt: ageAt, formatDate: formatDate, crc32: crc32, DISCLAIMER: DISCLAIMER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.TriagemExport = api;
})();
