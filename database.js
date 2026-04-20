let _renderBDTimer = null;
let expandedPartidas = new Set();
let collapsedCapitulos = new Set();

const APU_TYPE_META = {
  M: { label: 'Material', short: 'MAT', color: 'var(--azul)' },
  L: { label: 'Mano de Obra', short: 'M.O.', color: 'var(--acento)' },
  E: { label: 'Equipo', short: 'EQ.', color: 'var(--amarillo)' },
  S: { label: 'Subcontrato', short: 'SUB', color: 'var(--naranja)' },
};

function partidaKeyFromCode(cod){
  return String(cod || '').replace(/\./g, '_');
}

function getPartidaApu(cod){
  return APU[partidaKeyFromCode(cod)] || [];
}

function formatCantidad(valor){
  return Number.isInteger(valor) ? String(valor) : Number(valor || 0).toFixed(3);
}

function getApuTotals(insumos){
  return {
    M: Math.round(insumos.filter(i=>i.tipo === 'M').reduce((acc, i)=>acc + (i.qty * i.pu), 0)),
    L: Math.round(insumos.filter(i=>i.tipo === 'L').reduce((acc, i)=>acc + (i.qty * i.pu), 0)),
    E: Math.round(insumos.filter(i=>i.tipo === 'E').reduce((acc, i)=>acc + (i.qty * i.pu), 0)),
    S: Math.round(insumos.filter(i=>i.tipo === 'S').reduce((acc, i)=>acc + (i.qty * i.pu), 0)),
  };
}

function expandirPartida(id, forceOpen){
  const key = String(id);
  const open = typeof forceOpen === 'boolean' ? forceOpen : !expandedPartidas.has(key);
  if(open) expandedPartidas.add(key);
  else expandedPartidas.delete(key);
  renderBD();
}

function toggleCapituloBD(capId){
  const key = String(capId);
  if(collapsedCapitulos.has(key)) collapsedCapitulos.delete(key);
  else collapsedCapitulos.add(key);
  renderBD();
}

function renderBD(){
  clearTimeout(_renderBDTimer);
  _renderBDTimer = setTimeout(_renderBDNow, 50);
}

function limpiarBusquedaBD(){
  const input = document.getElementById('bd-search');
  if(input) input.value = '';
  renderBD();
}

function getRamoLabel(ramo){
  const labels = {
    todos: 'Todos',
    vial: 'Viales',
    civil: 'Civiles',
    electrica: 'Electricas',
    sanitaria: 'Sanitarias',
    hvac: 'Climatizacion',
    acabados: 'Acabados',
  };
  return labels[ramo] || ramo;
}

function valorTablaBD(valor){
  return valor > 0 ? fmtN(valor) : '-';
}

function renderCapituloRow(capId, partidas){
  const cap = capOf(capId);
  const collapsed = collapsedCapitulos.has(String(capId));
  const totalCap = partidas.reduce((acc, p)=>acc + pu(p), 0);
  return `
    <tr class="cap-row cap-row-toggle" data-cap="${capId}">
      <td colspan="11" style="background:${cap.color}CC">
        <div class="cap-row-inner">
          <button
            type="button"
            class="chapter-toggle ${collapsed ? '' : 'is-open'}"
            onclick="toggleCapituloBD('${capId}')"
            aria-expanded="${collapsed ? 'false' : 'true'}"
            title="${collapsed ? 'Expandir capitulo' : 'Replegar capitulo'}"
          >
            <span>${collapsed ? '+' : '-'}</span>
          </button>
          <div class="cap-row-copy">
            <strong>${capId} - ${cap.name}</strong>
            <span>${partidas.length} partida${partidas.length === 1 ? '' : 's'}</span>
          </div>
          <div class="cap-row-total">Gs. ${fmtN(totalCap)}</div>
        </div>
      </td>
    </tr>
  `;
}

function renderCapituloEmptyRow(capId){
  return `
    <tr class="db-empty-cap-row">
      <td colspan="11">
        <div class="empty-state" style="padding:22px 0">
          <h3 style="margin-bottom:4px">Capitulo ${capId} sin partidas</h3>
          <p>Usa "Nueva partida" para cargar items en este capitulo.</p>
        </div>
      </td>
    </tr>
  `;
}

function _renderBDNow(){
  document.getElementById('badge-count').textContent = `${DB.length} partidas`;

  const lista = filtrarDB();
  const q = (document.getElementById('bd-search')?.value || '').trim();
  const ramoFiltrado = ramoActivo !== 'todos';
  const clearBtn = document.getElementById('bd-clear-btn');
  const status = document.getElementById('bd-status-text');

  if(clearBtn) clearBtn.style.display = q ? 'inline-flex' : 'none';
  if(status){
    if(q && ramoFiltrado){
      status.textContent = `Mostrando ${lista.length} de ${DB.length} partidas para "${q}" en ${getRamoLabel(ramoActivo)}.`;
    } else if(q){
      status.textContent = `Mostrando ${lista.length} de ${DB.length} partidas para "${q}". Limpia el filtro para ver toda la base.`;
    } else if(ramoFiltrado){
      status.textContent = `Mostrando ${lista.length} de ${DB.length} partidas del ramo ${getRamoLabel(ramoActivo)}.`;
    } else {
      status.textContent = 'Cada partida concentra su resumen economico y su desglose APU en el mismo lugar. Expandi una fila para ver, editar y recalcular insumos sin salir de la base.';
    }
  }

  if(!lista.length && (q || ramoFiltrado)){
    document.getElementById('bd-tbody').innerHTML = `
      <tr>
        <td colspan="11">
          <div class="empty-state" style="padding:48px 0">
            <div class="icon">+</div>
            <h3>Sin partidas</h3>
            <p>No hay coincidencias con el filtro actual. Cambia el ramo, limpia la busqueda o agrega una nueva partida.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const gruposMap = new Map();
  lista.forEach(partida=>{
    if(!gruposMap.has(partida.cap)) gruposMap.set(partida.cap, []);
    gruposMap.get(partida.cap).push(partida);
  });

  const mostrarSoloGruposConResultados = q || ramoFiltrado;
  const grupos = mostrarSoloGruposConResultados
    ? Array.from(gruposMap.entries()).map(([capId, partidas])=>({ capId, partidas }))
    : CAPS.map(cap=>({ capId: cap.id, partidas: gruposMap.get(cap.id) || [] }));

  let html = '';

  grupos.forEach(grupo=>{
    const collapsed = collapsedCapitulos.has(String(grupo.capId));
    html += renderCapituloRow(grupo.capId, grupo.partidas);
    if(collapsed) return;
    if(!grupo.partidas.length){
      html += renderCapituloEmptyRow(grupo.capId);
      return;
    }
    grupo.partidas.forEach(partida=>{
      html += renderPartidaSummaryRow(partida);
      if(expandedPartidas.has(String(partida.id))){
        html += renderDetallePartidaRow(partida, capOf(partida.cap), getPartidaApu(partida.cod));
      }
    });
  });

  document.getElementById('bd-tbody').innerHTML = html;
}

function renderPartidaSummaryRow(partida){
  const apu = getPartidaApu(partida.cod);
  const enPres = PRESUPUESTO.some(item=>item.pid === partida.id);
  const qtyPres = enPres ? PRESUPUESTO.find(item=>item.pid === partida.id).qty : 0;
  const open = expandedPartidas.has(String(partida.id));
  const rowBg = enPres ? 'background:rgba(29,186,123,.04);border-left:2px solid var(--acento)' : '';
  const ramoBadge = partida.ramo && partida.ramo !== 'todos'
    ? `<span class="chip" style="background:${RAMO_COLORS[partida.ramo] || '#888'}22;color:${RAMO_COLORS[partida.ramo] || '#888'}">${partida.ramo}</span>`
    : '<span class="chip chip-muted">general</span>';
  const presBadge = enPres
    ? `<span class="chip chip-success">En presupuesto | ${qtyPres % 1 === 0 ? qtyPres : qtyPres.toFixed(2)}</span>`
    : '';

  return `
    <tr class="db-summary-row" style="${rowBg}" data-pid="${partida.id}">
      <td>
        <button
          class="accordion-toggle ${open ? 'is-open' : ''}"
          type="button"
          onclick="expandirPartida(${partida.id})"
          aria-expanded="${open ? 'true' : 'false'}"
          aria-controls="apu-panel-${partida.id}"
          title="${open ? 'Ocultar APU' : 'Mostrar APU'}"
        >
          <span>${open ? '-' : '+'}</span>
        </button>
      </td>
      <td><code class="cell-code">${partida.cod}</code></td>
      <td>
        <div class="cell-description">${partida.desc}</div>
        <div class="cell-meta">
          ${presBadge}
          <span class="chip chip-outline">${apu.length} insumo${apu.length === 1 ? '' : 's'}</span>
        </div>
      </td>
      <td class="cell-unit">${partida.u}</td>
      <td>${ramoBadge}</td>
      <td class="num" style="color:var(--azul)">${valorTablaBD(partida.mat)}</td>
      <td class="num" style="color:var(--acento)">${valorTablaBD(partida.mo)}</td>
      <td class="num" style="color:var(--amarillo)">${valorTablaBD(partida.eq)}</td>
      <td class="num" style="color:var(--naranja)">${valorTablaBD(partida.sub)}</td>
      <td class="num total-cell">${fmtN(pu(partida))}</td>
      <td>
        <div class="table-actions">
          <div class="budget-action-group">
            <button class="budget-action-btn add" onclick="addToPres(${partida.id})">${enPres ? 'Agregar +1' : 'Agregar'}</button>
            <button class="budget-action-btn remove" onclick="quitarPres(${partida.id})" ${enPres ? '' : 'disabled'}>Excluir</button>
          </div>
          <div class="table-actions-secondary">
            <button class="btn btn-secondary btn-xs" onclick="editarPartida(${partida.id})">Editar</button>
            <button class="btn btn-danger btn-xs" onclick="eliminarPartida(${partida.id})">Eliminar</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function enPresStyle(enPres){
  return enPres
    ? 'background:var(--acento4);color:var(--acento);border:1px solid var(--acento2)'
    : 'background:var(--naranjabg);color:var(--naranja);border:1px solid rgba(232,144,32,.2)';
}

function renderDetallePartidaRow(partida, cap, insumos){
  const totals = insumos.length
    ? getApuTotals(insumos)
    : { M: partida.mat || 0, L: partida.mo || 0, E: partida.eq || 0, S: partida.sub || 0 };
  const total = Math.round(totals.M + totals.L + totals.E + totals.S);

  const resumenTecnico = `
    <div class="apu-inline-summary">
      <div>
        <p class="apu-inline-label">Capitulo</p>
        <strong>${cap.id} - ${cap.name}</strong>
      </div>
      <div>
        <p class="apu-inline-label">Unidad</p>
        <strong>${partida.u}</strong>
      </div>
      <div>
        <p class="apu-inline-label">Ramo</p>
        <strong>${partida.ramo || 'todos'}</strong>
      </div>
      <div>
        <p class="apu-inline-label">Precio unitario</p>
        <strong>${fmt(total)}</strong>
      </div>
    </div>
  `;

  const kpis = Object.entries(APU_TYPE_META).map(([tipo, meta])=>`
    <div class="apu-kpi">
      <span class="bdg bdg-${tipo}">${meta.short}</span>
      <div>
        <p>${meta.label}</p>
        <strong style="color:${meta.color}">${fmt(totals[tipo])}</strong>
      </div>
    </div>
  `).join('');

  const tabla = insumos.length
    ? renderTablaApuInline(partida, insumos, totals)
    : `
      <div class="apu-empty">
        <div>
          <h3>Sin insumos cargados</h3>
          <p>Agrega materiales, mano de obra, equipo o subcontrato para construir el APU de esta partida.</p>
        </div>
        <button class="btn btn-primary" onclick="agregarInsumoA('${partida.cod}')">+ Agregar insumo</button>
      </div>
    `;

  return `
    <tr class="db-detail-row">
      <td colspan="11">
        <article class="apu-inline-card" id="apu-panel-${partida.id}">
          <div class="apu-inline-head">
            <div>
              <p class="apu-inline-eyebrow">APU integrado</p>
              <h3>${partida.cod} - ${partida.desc}</h3>
              <p class="apu-inline-sub">El desglose tecnico ahora vive dentro de la Base de Datos para mantener contexto, trazabilidad y edicion rapida.</p>
            </div>
            <div class="apu-inline-head-actions">
              <button class="btn btn-secondary" onclick="editarPartida(${partida.id})">Editar partida</button>
              <button class="btn btn-primary" onclick="agregarInsumoA('${partida.cod}')">+ Agregar insumo</button>
            </div>
          </div>
          ${resumenTecnico}
          <div class="apu-kpis">${kpis}</div>
          ${tabla}
        </article>
      </td>
    </tr>
  `;
}

function renderTablaApuInline(partida, insumos, totals){
  const total = Math.max(1, totals.M + totals.L + totals.E + totals.S);
  const rows = insumos.map((insumo, idx)=>{
    const subtotal = Math.round(insumo.qty * insumo.pu);
    const pct = ((subtotal / total) * 100).toFixed(1);
    const meta = APU_TYPE_META[insumo.tipo] || APU_TYPE_META.M;
    return `
      <tr class="apu-inline-row" onclick="editarInsumo('${partida.cod}',${idx})">
        <td>${idx + 1}</td>
        <td>${insumo.desc}</td>
        <td class="cell-unit">${insumo.u}</td>
        <td><span class="bdg bdg-${insumo.tipo}">${meta.short}</span></td>
        <td class="num">${formatCantidad(insumo.qty)}</td>
        <td class="num">${fmtN(insumo.pu)}</td>
        <td class="num" style="color:${meta.color}">${fmtN(subtotal)}</td>
        <td class="num">${pct}%</td>
        <td><button class="btn btn-danger btn-xs" onclick="event.stopPropagation(); eliminarInsumo('${partida.cod}',${idx})">Quitar</button></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="tbl-wrap apu-inline-table-wrap">
      <table class="apu-inline-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Descripcion</th>
            <th>Unidad</th>
            <th>Tipo</th>
            <th class="num">Cantidad</th>
            <th class="num">P. unitario</th>
            <th class="num">Subtotal</th>
            <th class="num">% APU</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5">
              <div class="apu-foot-pills">
                <span class="cost-pill" style="color:var(--azul)">Materiales: ${fmt(totals.M)}</span>
                <span class="cost-pill" style="color:var(--acento)">Mano de obra: ${fmt(totals.L)}</span>
                <span class="cost-pill" style="color:var(--amarillo)">Equipo: ${fmt(totals.E)}</span>
                <span class="cost-pill" style="color:var(--naranja)">Subcontrato: ${fmt(totals.S)}</span>
              </div>
            </td>
            <td colspan="3" class="num apu-total-label">Precio unitario final [${partida.u}]</td>
            <td class="num apu-total-value">${fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function abrirModalPartida(id){
  editPid = id || null;
  document.getElementById('f-cap').innerHTML = CAPS.map(c=>`<option value="${c.id}">${c.id} - ${c.name}</option>`).join('');

  if(id){
    const partida = DB.find(item=>item.id === id);
    document.getElementById('mp-title').textContent = `Editar Partida - ${partida.cod}`;
    document.getElementById('f-cap').value = partida.cap;
    document.getElementById('f-cod').value = partida.cod;
    document.getElementById('f-ramo').value = partida.ramo || 'todos';
    document.getElementById('f-u').value = partida.u;
    document.getElementById('f-desc').value = partida.desc;
    document.getElementById('f-mat').value = partida.mat;
    document.getElementById('f-mo').value = partida.mo;
    document.getElementById('f-eq').value = partida.eq;
    document.getElementById('f-sub').value = partida.sub;
  }else{
    document.getElementById('mp-title').textContent = 'Nueva Partida';
    document.getElementById('f-cod').value = '';
    document.getElementById('f-desc').value = '';
    ['f-mat', 'f-mo', 'f-eq', 'f-sub'].forEach(idCampo=>{
      document.getElementById(idCampo).value = 0;
    });
    document.getElementById('f-cap').value = '01';
    document.getElementById('f-ramo').value = ramoActivo === 'todos' ? 'civil' : ramoActivo;
    autoCod();
  }

  updPU();
  abrirModal('modal-partida');
}

function editarPartida(id){
  abrirModalPartida(id);
}

function autoCod(){
  if(editPid) return;
  const cap = document.getElementById('f-cap').value;
  const correlativos = DB
    .filter(partida=>partida.cap === cap)
    .map(partida=>parseInt((String(partida.cod).split('.')[1] || '0'), 10))
    .filter(Number.isFinite);
  const siguiente = correlativos.length ? Math.max(...correlativos) + 1 : 1;
  document.getElementById('f-cod').value = `${cap}.${String(siguiente).padStart(2, '0')}`;
}

function updPU(){
  const total = ['f-mat', 'f-mo', 'f-eq', 'f-sub']
    .reduce((acc, idCampo)=>acc + (parseFloat(document.getElementById(idCampo).value) || 0), 0);
  document.getElementById('f-pu-show').textContent = `Gs. ${Math.round(total).toLocaleString('es-PY')}`;
}

function guardarPartida(){
  const cod = document.getElementById('f-cod').value.trim();
  const desc = document.getElementById('f-desc').value.trim();

  if(!cod || !desc){
    notif('Completa codigo y descripcion', '#E05555');
    return;
  }

  const codigoDuplicado = DB.some(partida=>partida.cod === cod && partida.id !== editPid);
  if(codigoDuplicado){
    notif('Ya existe una partida con ese codigo', '#E05555');
    return;
  }

  const partida = {
    id: editPid || nextNumericId(DB),
    cap: document.getElementById('f-cap').value,
    cod,
    desc,
    u: document.getElementById('f-u').value,
    ramo: document.getElementById('f-ramo').value,
    mat: toNonNegativeNumber(document.getElementById('f-mat').value),
    mo: toNonNegativeNumber(document.getElementById('f-mo').value),
    eq: toNonNegativeNumber(document.getElementById('f-eq').value),
    sub: toNonNegativeNumber(document.getElementById('f-sub').value),
  };

  if(editPid){
    const idx = DB.findIndex(item=>item.id === editPid);
    const anterior = DB[idx];
    pushHistorial('editPartida', { partida: { ...anterior } });
    DB[idx] = partida;

    if(anterior.cod !== cod){
      const oldKey = partidaKeyFromCode(anterior.cod);
      const newKey = partidaKeyFromCode(cod);
      if(APU[oldKey]){
        APU[newKey] = [...(APU[newKey] || []), ...APU[oldKey]];
        delete APU[oldKey];
      }
    }
  }else{
    DB.push(partida);
  }

  cerrarModal('modal-partida');
  marcarUnsaved();
  renderBD();
  renderDashboard();
  notif(editPid ? 'Partida actualizada' : 'Partida agregada');
}

function eliminarPartida(id){
  const partida = DB.find(item=>item.id === id);
  const ok = prompt(`Para eliminar escribi el codigo exacto:\n\n"${partida.cod} - ${partida.desc}"\n\nCodigo:`);
  if(ok === null) return;
  if(ok.trim() !== partida.cod){
    notif('Codigo incorrecto - no se elimino', '#E05555');
    return;
  }

  const idx = DB.findIndex(item=>item.id === id);
  const presItems = PRESUPUESTO.filter(item=>item.pid === id);
  pushHistorial('elimPartida', {
    idx,
    partida: { ...partida },
    apu: getPartidaApu(partida.cod).length ? [...getPartidaApu(partida.cod)] : null,
    presItems: [...presItems],
  });

  DB = DB.filter(item=>item.id !== id);
  PRESUPUESTO = PRESUPUESTO.filter(item=>item.pid !== id);
  expandedPartidas.delete(String(id));
  delete APU[partidaKeyFromCode(partida.cod)];
  marcarUnsaved();
  renderBD();
  renderPres();
  renderDashboard();
  notif('Eliminada - Ctrl+Z para deshacer', '#E05555');
}

function renderAPU(){
  renderBD();
}

function abrirModalInsumo(){
  resetInsumoModalState();
  _openIM();
}

function agregarInsumoA(cod){
  resetInsumoModalState();
  editInsCod = cod;
  _openIM(cod);
}

function editarInsumo(cod, idx){
  editInsCod = cod;
  editInsIdx = idx;
  const insumo = getPartidaApu(cod)[idx];
  _openIM(cod);
  document.getElementById('ai-desc').value = insumo.desc;
  document.getElementById('ai-u').value = insumo.u;
  document.getElementById('ai-tipo').value = insumo.tipo;
  document.getElementById('ai-qty').value = insumo.qty;
  document.getElementById('ai-pu').value = insumo.pu;
  document.getElementById('mi-title').textContent = 'Editar Insumo';
}

function _openIM(cod){
  document.getElementById('ai-partida').innerHTML = DB.map(partida=>`
    <option value="${partida.cod}" ${partida.cod === (cod || '') ? 'selected' : ''}>${partida.cod} - ${partida.desc}</option>
  `).join('');
  document.getElementById('ai-partida').disabled = editInsIdx != null;
  document.getElementById('mi-title').textContent = 'Agregar Insumo';
  if(editInsIdx == null){
    document.getElementById('ai-desc').value = '';
    document.getElementById('ai-u').value = 'un';
    document.getElementById('ai-tipo').value = 'M';
    document.getElementById('ai-qty').value = 1;
    document.getElementById('ai-pu').value = 0;
  }
  abrirModal('modal-insumo');
}

function resetInsumoModalState(){
  editInsIdx = null;
  editInsCod = null;
  const selectPartida = document.getElementById('ai-partida');
  if(selectPartida) selectPartida.disabled = false;
}

function guardarInsumo(){
  const cod = document.getElementById('ai-partida').value;
  const desc = document.getElementById('ai-desc').value.trim();
  const qty = parseFloat(document.getElementById('ai-qty').value);
  const puInsumo = parseFloat(document.getElementById('ai-pu').value);

  if(!desc){
    notif('Ingresa la descripcion del insumo', '#E05555');
    return;
  }
  if(!(qty > 0)){
    notif('La cantidad del insumo debe ser mayor a cero', '#E05555');
    return;
  }
  if(puInsumo < 0){
    notif('El precio unitario del insumo no puede ser negativo', '#E05555');
    return;
  }

  const insumo = {
    desc,
    u: document.getElementById('ai-u').value,
    tipo: document.getElementById('ai-tipo').value,
    qty,
    pu: toNonNegativeNumber(puInsumo),
  };

  const codKey = partidaKeyFromCode(cod);
  if(!APU[codKey]) APU[codKey] = [];
  const prevIns = [...APU[codKey]];

  if(editInsIdx != null){
    pushHistorial('editInsumo', { cod: codKey, insumosPrev: prevIns });
    APU[codKey][editInsIdx] = insumo;
  }else{
    pushHistorial('agregarInsumo', { cod: codKey, insumosPrev: prevIns });
    APU[codKey].push(insumo);
  }

  recalcDesdeAPU(cod);
  const partida = DB.find(item=>item.cod === cod);
  if(partida){
    expandedPartidas.add(String(partida.id));
    collapsedCapitulos.delete(String(partida.cap));
  }
  resetInsumoModalState();
  cerrarModal('modal-insumo');
  marcarUnsaved();
  renderBD();
  notif('Insumo guardado');
}

function eliminarInsumo(cod, idx){
  const codKey = partidaKeyFromCode(cod);
  pushHistorial('elimInsumo', { cod: codKey, idx, insumo: { ...APU[codKey][idx] } });
  APU[codKey].splice(idx, 1);
  recalcDesdeAPU(cod);
  marcarUnsaved();
  renderBD();
  notif('Eliminado - Ctrl+Z para deshacer', '#E89020');
}

function recalcDesdeAPU(cod){
  const insumos = getPartidaApu(cod);
  const partida = DB.find(item=>item.cod === cod);
  if(!partida) return;
  partida.mat = Math.round(insumos.filter(i=>i.tipo === 'M').reduce((acc, i)=>acc + (i.qty * i.pu), 0));
  partida.mo = Math.round(insumos.filter(i=>i.tipo === 'L').reduce((acc, i)=>acc + (i.qty * i.pu), 0));
  partida.eq = Math.round(insumos.filter(i=>i.tipo === 'E').reduce((acc, i)=>acc + (i.qty * i.pu), 0));
  partida.sub = Math.round(insumos.filter(i=>i.tipo === 'S').reduce((acc, i)=>acc + (i.qty * i.pu), 0));
}


