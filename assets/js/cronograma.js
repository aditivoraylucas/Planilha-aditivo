/**
 * cronograma.js — parser exclusivo para planilha Cronograma Físico-Financeiro.
 * Não altera nem importa nenhuma lógica de medição existente.
 */
export function parseCronogramaXLSX(workbook){
  // Tenta achar aba com nome parecido com "cronograma"
  const sheetName = workbook.SheetNames.find(n =>
    n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes('cronograma')
  ) || workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // --- Localiza linha de cabeçalho dos meses (contém pelo menos 4 células numéricas 1..N)
  let mesHeaderRowIdx = -1;
  let mesColMap = {}; // mes (1..N) => índice da coluna de '%'
  for(let ri = 0; ri < raw.length; ri++){
    const row = raw[ri];
    const numericos = row.filter(c => c !== '' && !isNaN(Number(c)) && Number(c) >= 1 && Number(c) <= 36);
    if(numericos.length >= 3){
      mesHeaderRowIdx = ri;
      row.forEach((c, ci) => {
        const n = Number(c);
        if(c !== '' && !isNaN(n) && n >= 1 && n <= 36){
          mesColMap[n] = ci; // coluna % do mês n
        }
      });
      break;
    }
  }
  if(mesHeaderRowIdx < 0) throw new Error('Linha de meses não encontrada na planilha.');

  const meses = Object.keys(mesColMap).map(Number).sort((a,b)=>a-b);

  // --- Localiza coluna ITEM (primeira coluna com cabeçalho parecido ou simplesmente col 0)
  let itemCol = 0;
  for(let ri = 0; ri < mesHeaderRowIdx; ri++){
    const row = raw[ri];
    const idx = row.findIndex(c => String(c).toLowerCase().trim() === 'item');
    if(idx >= 0){ itemCol = idx; break; }
  }

  // --- Lê itens: linhas após mesHeaderRow+1 (pula linha de %/R$)
  // Linha de %/R$ fica logo abaixo do mesHeader
  const dataStartRow = mesHeaderRowIdx + 2;
  const itens = [];
  for(let ri = dataStartRow; ri < raw.length; ri++){
    const row = raw[ri];
    const itemVal = row[itemCol];
    // Para quando encontrar TOTAL ou linha vazia
    if(String(itemVal).toLowerCase().includes('total')) break;
    if(itemVal === '' || itemVal === null || itemVal === undefined) continue;
    const numItem = Number(itemVal);
    if(isNaN(numItem) || numItem <= 0) continue;

    const mesesItem = meses.map(m => {
      const pctCol = mesColMap[m];
      const valCol = pctCol + 1; // coluna R$ é sempre a seguinte à %
      const p = Number(row[pctCol]) || 0;
      const v = Number(row[valCol]) || 0;
      return { mes: m, pct: p, valor: v };
    });

    itens.push({
      item: numItem,
      descricao: String(row[itemCol + 1] || '').trim(),
      meses: mesesItem
    });
  }

  if(!itens.length) throw new Error('Nenhum item encontrado na planilha de cronograma.');

  // --- Agrega por mês: soma % ponderada pelo valor total e soma valor
  // Para % total do mês: usamos a linha TOTAL SIMPLES da planilha se existir,
  // senão recalculamos somando valores de cada item.
  const porMes = {};
  meses.forEach(m => { porMes[m] = { planejadoPct: 0, planejadoValor: 0 }; });

  // Tenta ler linha TOTAL SIMPLES
  let totalRow = null;
  for(let ri = dataStartRow; ri < raw.length; ri++){
    const row = raw[ri];
    const cell = String(row[itemCol]).toLowerCase() + ' ' + String(row[itemCol+1]||'').toLowerCase();
    if(cell.includes('total') && cell.includes('simples')){
      totalRow = row; break;
    }
    // fallback: linha com 'TOTAL' e 'SIMPLES' em qualquer célula
    if(row.some(c => String(c).toLowerCase().includes('simples'))){
      totalRow = row; break;
    }
  }

  if(totalRow){
    meses.forEach(m => {
      const pctCol = mesColMap[m];
      const valCol = pctCol + 1;
      porMes[m].planejadoPct   = +(Number(totalRow[pctCol]) * 100).toFixed(4); // vem como 0..1
      porMes[m].planejadoValor = Number(totalRow[valCol]) || 0;
    });
  } else {
    // fallback: soma valores dos itens
    itens.forEach(it => {
      it.meses.forEach(({ mes, valor }) => { porMes[mes].planejadoValor += valor; });
    });
    const totalValor = Object.values(porMes).reduce((a,b)=>a+b.planejadoValor,0);
    meses.forEach(m => {
      porMes[m].planejadoPct = totalValor > 0
        ? +(porMes[m].planejadoValor / totalValor * 100).toFixed(4)
        : 0;
    });
  }

  // --- Monta array final
  const cronograma = meses.map(m => ({
    mes: m,
    planejadoPct:   porMes[m].planejadoPct,
    planejadoValor: porMes[m].planejadoValor
  }));

  return { cronograma, totalMeses: meses.length, itens };
}
