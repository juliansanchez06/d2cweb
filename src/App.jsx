import { useState, useEffect, useMemo } from 'react'
import { db } from './firebase'
import { collection, onSnapshot, doc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore'

// ─── CONFIG DE NEGOCIO ──────────────────────────────────────────
const WHATSAPP = '5493584000000'          // ← reemplazar por el número real
const PCT_SENIA = 0.30                      // seña 30% online
const VARIACION = 0.15                      // ±15% peso variable
const ZONA = 'Río Cuarto (ciudad)'

// ─── DESIGN TOKENS ──────────────────────────────────────────────
const C = {
  bg:'#F2EDE8', surface:'#FAF7F4', ink:'#241a17', ink2:'#5c4d45', faint:'#a8978c',
  wine:'#6B1E1E', wineDark:'#511616', wineLight:'#8a3a3a',
  green:'#3d6b35', greenBg:'#eef3e8', cream:'#fcfaf7',
  gold:'#b08442', line:'#e0d6cc', line2:'#cbbdb0',
  amber:'#b5701a', amberBg:'#fbf2e3', red:'#b32d2d', redBg:'#fbece9',
}

const GS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Archivo:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  body{background:${C.bg};color:${C.ink};font-family:'Archivo',sans-serif;-webkit-font-smoothing:antialiased;}
  ::selection{background:${C.wine};color:${C.cream};}
  ::-webkit-scrollbar{width:10px;}
  ::-webkit-scrollbar-track{background:${C.bg};}
  ::-webkit-scrollbar-thumb{background:${C.line2};border-radius:5px;border:2px solid ${C.bg};}
  input,button,select{font-family:'Archivo',sans-serif;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  @keyframes slideIn{from{transform:translateX(100%);}to{transform:translateX(0);}}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}
  .fade-up{animation:fadeUp .6s cubic-bezier(.2,.7,.3,1) both;}
  .lift{transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .25s;}
  .lift:hover{transform:translateY(-4px);box-shadow:0 14px 40px rgba(36,26,23,.13);}
  .btn{transition:all .2s;cursor:pointer;}
  .btn:hover{transform:translateY(-1px);}
  .btn:active{transform:translateY(0);}
  .grain:before{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.025;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)'/%3E%3C/svg%3E");}
`

const fmt = n => '$' + Math.round(n).toLocaleString('es-AR')
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')

// ─── LOGO ───────────────────────────────────────────────────────
function Logo({ size=44, light=false }) {
  const stroke = light ? C.cream : C.ink
  const banner = light ? C.cream : C.wine
  return (
    <svg width={size} height={size} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <circle cx="250" cy="210" r="175" fill="none" stroke={stroke} strokeWidth="9"/>
      <ellipse cx="255" cy="195" rx="82" ry="52" fill={stroke}/>
      <ellipse cx="328" cy="165" rx="36" ry="28" fill={stroke}/>
      <path d="M335 142 Q345 120 358 128" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"/>
      <rect x="186" y="238" width="17" height="48" rx="6" fill={stroke}/>
      <rect x="220" y="238" width="17" height="48" rx="6" fill={stroke}/>
      <rect x="276" y="238" width="17" height="48" rx="6" fill={stroke}/>
      <rect x="310" y="238" width="17" height="48" rx="6" fill={stroke}/>
      <path d="M172 200 Q150 188 154 208" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"/>
      <rect x="110" y="232" width="9" height="42" fill={stroke}/>
      <ellipse cx="114" cy="216" rx="20" ry="26" fill={stroke}/>
      <path d="M92 276 Q250 256 408 268" fill="none" stroke={stroke} strokeWidth="4"/>
      <rect x="64" y="300" width="372" height="72" rx="7" fill={banner}/>
      <text x="250" y="350" fontFamily="Fraunces,serif" fontSize="44" fontWeight="700" fill={light?C.wine:C.cream} textAnchor="middle" letterSpacing="2">EL RETIRO</text>
    </svg>
  )
}

// ─── DATOS: ETAPAS DEL VIAJE ────────────────────────────────────
const VIAJE = [
  { ic:'🌾', t:'Sol de Julio', d:'Nuestros novillos nacen y se crían a campo abierto en el monte santiagueño. Angus y Hereford, sin apuro.' },
  { ic:'🐄', t:'27 meses', d:'Crianza pastoril con terminación a grano. Sin anabólicos. El animal llega a su punto justo de grasa.' },
  { ic:'🏭', t:'Frigorífico', d:'Faena habilitada y maduración en cámara. Envasado al vacío el mismo día, sin cadena de intermediarios.' },
  { ic:'🛵', t:'Tu mesa', d:'Llega a tu casa en Río Cuarto, en frío, en la ventana que elegiste. Del productor directo a vos.' },
]

// ─── COMPONENTE: AVISO COLOR DE CARNE ───────────────────────────
function ColorNote({ inline }) {
  const [open, setOpen] = useState(false)
  if (inline) return (
    <div style={{background:C.amberBg,border:`1px solid #ecd9b5`,borderRadius:12,padding:'10px 14px',marginTop:10}}>
      <button onClick={()=>setOpen(!open)} style={{background:'none',border:'none',display:'flex',alignItems:'center',gap:8,cursor:'pointer',width:'100%',textAlign:'left',padding:0}}>
        <span style={{fontSize:16}}>🟤→🔴</span>
        <span style={{fontSize:12,fontWeight:600,color:C.amber,flex:1}}>¿Por qué la carne al vacío es oscura?</span>
        <span style={{color:C.amber,fontSize:11}}>{open?'−':'+'}</span>
      </button>
      {open && <p style={{fontSize:12,color:C.ink2,lineHeight:1.7,marginTop:8}}>
        Al envasar al vacío sacamos el oxígeno, y sin oxígeno la carne toma un color púrpura oscuro. Es completamente normal y señal de frescura sin conservantes. Cuando abrís la bolsa y toma aire, <strong>recupera su rojo intenso en 15-30 minutos</strong>. Dejala respirar antes de cocinar.
      </p>}
    </div>
  )
  return null
}

// ─── HEADER ─────────────────────────────────────────────────────
function Header({ cartCount, onCart }) {
  return (
    <header style={{position:'sticky',top:0,zIndex:50,background:'rgba(242,237,232,.85)',backdropFilter:'blur(12px)',borderBottom:`1px solid ${C.line}`}}>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <a href="#inicio" style={{display:'flex',alignItems:'center',gap:12,textDecoration:'none'}}>
          <Logo size={42}/>
          <div>
            <div style={{fontFamily:'Fraunces,serif',fontSize:19,fontWeight:700,color:C.wine,lineHeight:.95,letterSpacing:'.01em'}}>El Retiro</div>
            <div style={{fontSize:9.5,color:C.faint,letterSpacing:'.14em',textTransform:'uppercase'}}>De nuestro campo a tu mesa</div>
          </div>
        </a>
        <nav style={{display:'flex',alignItems:'center',gap:28}}>
          <a href="#cortes" style={{fontSize:13,color:C.ink2,textDecoration:'none',fontWeight:500}} className="navlink">Cortes</a>
          <a href="#viaje" style={{fontSize:13,color:C.ink2,textDecoration:'none',fontWeight:500}}>El viaje</a>
          <button onClick={onCart} className="btn" style={{position:'relative',background:C.wine,color:C.cream,border:'none',borderRadius:30,padding:'9px 20px',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
            🛒 Pedido
            {cartCount>0 && <span style={{background:C.gold,color:C.ink,borderRadius:20,minWidth:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,padding:'0 5px'}}>{cartCount}</span>}
          </button>
        </nav>
      </div>
    </header>
  )
}

// ─── HERO ───────────────────────────────────────────────────────
function Hero() {
  return (
    <section id="inicio" style={{maxWidth:1100,margin:'0 auto',padding:'70px 24px 50px',position:'relative'}}>
      <div className="fade-up" style={{textAlign:'center',position:'relative',zIndex:2}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,background:C.greenBg,border:`1px solid #cdd9c0`,borderRadius:30,padding:'6px 16px',marginBottom:24}}>
          <span style={{width:7,height:7,borderRadius:10,background:C.green,animation:'pulse 2s infinite'}}/>
          <span style={{fontSize:12,fontWeight:600,color:C.green,letterSpacing:'.02em'}}>Productor directo · Trazabilidad total</span>
        </div>
        <h1 style={{fontFamily:'Fraunces,serif',fontSize:'clamp(40px,7vw,76px)',fontWeight:600,lineHeight:1.02,letterSpacing:'-.02em',color:C.ink,marginBottom:20}}>
          La carne que criamos,<br/><em style={{fontStyle:'italic',color:C.wine}}>en tu mesa</em>
        </h1>
        <p style={{fontSize:'clamp(15px,2vw,18px)',color:C.ink2,maxWidth:540,margin:'0 auto 32px',lineHeight:1.6}}>
          Cortes premium de novillos criados en nuestro campo de Sol de Julio. Sin intermediarios. Envasados al vacío y entregados en frío en Río Cuarto.
        </p>
        <a href="#cortes" className="btn" style={{display:'inline-block',background:C.wine,color:C.cream,textDecoration:'none',borderRadius:32,padding:'15px 38px',fontSize:15,fontWeight:600,boxShadow:'0 8px 24px rgba(107,30,30,.25)'}}>
          Ver los cortes disponibles
        </a>
      </div>
    </section>
  )
}

// ─── CARD DE CORTE ──────────────────────────────────────────────
function CutCard({ cut, onAdd, idx }) {
  const real = (cut.kgDisponible||0) - (cut.kgReservado||0)
  const agotado = real <= 0.3
  const ultimos = real > 0.3 && real < 3
  const badge = agotado ? {t:'Agotado',bg:'#efe6e0',c:C.faint}
    : ultimos ? {t:`¡Últimos ${real.toFixed(1)} kg!`,bg:C.amberBg,c:C.amber}
    : {t:'Disponible',bg:C.greenBg,c:C.green}
  return (
    <div className="lift fade-up" style={{animationDelay:`${idx*60}ms`,background:C.surface,border:`1px solid ${C.line}`,borderRadius:18,overflow:'hidden',display:'flex',flexDirection:'column',opacity:agotado?.62:1}}>
      <div style={{height:120,background:`linear-gradient(135deg,${C.wine} 0%,${C.wineDark} 100%)`,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <span style={{fontFamily:'Fraunces,serif',fontSize:54,color:'rgba(252,250,247,.13)',fontWeight:600,position:'absolute'}}>{cut.nombre[0]}</span>
        <span style={{position:'absolute',top:12,right:12,fontSize:10.5,fontWeight:700,padding:'4px 11px',borderRadius:20,background:badge.bg,color:badge.c,letterSpacing:'.02em'}}>{badge.t}</span>
        <span style={{fontSize:34,filter:'grayscale(.2)'}}>🥩</span>
      </div>
      <div style={{padding:'16px 18px',display:'flex',flexDirection:'column',flex:1}}>
        <h3 style={{fontFamily:'Fraunces,serif',fontSize:21,fontWeight:600,color:C.ink,marginBottom:4}}>{cut.nombre}</h3>
        <div style={{fontSize:12.5,color:C.ink2,marginBottom:14,lineHeight:1.5,flex:1}}>{cut.desc || 'Corte premium de nuestra hacienda, envasado al vacío.'}</div>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <span style={{fontFamily:'Fraunces,serif',fontSize:25,fontWeight:600,color:C.wine}}>{fmt(cut.precioKg)}</span>
            <span style={{fontSize:12,color:C.faint}}>/kg</span>
          </div>
          {!agotado && <span style={{fontSize:11,color:C.faint}}>~{cut.pesoEst||500}g por pieza</span>}
        </div>
        <button disabled={agotado} onClick={()=>onAdd(cut)} className="btn"
          style={{background:agotado?C.line:C.ink,color:agotado?C.faint:C.cream,border:'none',borderRadius:12,padding:'11px',fontSize:13.5,fontWeight:600,cursor:agotado?'not-allowed':'pointer'}}>
          {agotado?'Sin stock':'Agregar al pedido +'}
        </button>
      </div>
    </div>
  )
}

// ─── SECCIÓN CORTES ─────────────────────────────────────────────
function Catalog({ stock, loading, onAdd }) {
  return (
    <section id="cortes" style={{maxWidth:1100,margin:'0 auto',padding:'40px 24px'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:C.gold,letterSpacing:'.14em',textTransform:'uppercase',marginBottom:8}}>Stock en vivo</div>
          <h2 style={{fontFamily:'Fraunces,serif',fontSize:'clamp(30px,4vw,42px)',fontWeight:600,color:C.ink,letterSpacing:'-.01em'}}>Cortes disponibles hoy</h2>
        </div>
        <p style={{fontSize:13,color:C.ink2,maxWidth:300,lineHeight:1.5}}>Lo que ves es lo que hay. El stock se actualiza en tiempo real con cada faena y cada pedido.</p>
      </div>
      <ColorNote inline/>
      {loading ? (
        <div style={{textAlign:'center',padding:'80px 0',color:C.faint}}>
          <div style={{fontSize:40,marginBottom:12,animation:'pulse 1.5s infinite'}}>🥩</div>
          Cargando stock en vivo...
        </div>
      ) : stock.length===0 ? (
        <div style={{textAlign:'center',padding:'70px 24px',background:C.surface,borderRadius:18,border:`1px solid ${C.line}`,marginTop:20}}>
          <div style={{fontSize:40,marginBottom:12}}>📦</div>
          <h3 style={{fontFamily:'Fraunces,serif',fontSize:24,color:C.ink,marginBottom:8}}>Estamos preparando el próximo lote</h3>
          <p style={{fontSize:14,color:C.ink2,maxWidth:380,margin:'0 auto'}}>Pronto vas a ver acá los cortes disponibles. Escribinos por WhatsApp para reservar del próximo envío.</p>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:20,marginTop:24}}>
          {stock.map((c,i)=><CutCard key={c.id} cut={c} onAdd={onAdd} idx={i}/>)}
        </div>
      )}
    </section>
  )
}

// ─── SECCIÓN EL VIAJE ───────────────────────────────────────────
function Viaje() {
  return (
    <section id="viaje" style={{background:C.wine,padding:'70px 24px',marginTop:40}}>
      <div style={{maxWidth:1100,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:48}}>
          <div style={{fontSize:12,fontWeight:700,color:C.gold,letterSpacing:'.14em',textTransform:'uppercase',marginBottom:10}}>De productor a consumidor</div>
          <h2 style={{fontFamily:'Fraunces,serif',fontSize:'clamp(30px,4vw,44px)',fontWeight:600,color:C.cream}}>El viaje de tu carne</h2>
          <p style={{fontSize:15,color:'rgba(252,250,247,.7)',maxWidth:440,margin:'14px auto 0'}}>Sabemos el campo, el animal y el día. Cada corte tiene una historia que podemos contarte.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:20}}>
          {VIAJE.map((e,i)=>(
            <div key={i} style={{textAlign:'center',position:'relative'}}>
              <div style={{width:72,height:72,borderRadius:50,background:'rgba(252,250,247,.08)',border:'1px solid rgba(252,250,247,.18)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,margin:'0 auto 16px'}}>{e.ic}</div>
              <div style={{fontSize:11,color:C.gold,fontWeight:700,marginBottom:6}}>0{i+1}</div>
              <h3 style={{fontFamily:'Fraunces,serif',fontSize:22,fontWeight:600,color:C.cream,marginBottom:8}}>{e.t}</h3>
              <p style={{fontSize:13,color:'rgba(252,250,247,.68)',lineHeight:1.6}}>{e.d}</p>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:32,marginTop:48,flexWrap:'wrap'}}>
          {[['🐄','Productor directo'],['✅','Faena habilitada'],['🌿','Sin anabólicos'],['❄️','Cadena de frío']].map(([ic,t])=>(
            <div key={t} style={{display:'flex',alignItems:'center',gap:9,color:'rgba(252,250,247,.85)',fontSize:13,fontWeight:500}}><span style={{fontSize:18}}>{ic}</span>{t}</div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CARRITO (drawer lateral) ───────────────────────────────────
function Cart({ open, items, onClose, onQty, onRemove, onCheckout }) {
  const totalSenia = items.reduce((a,it)=>a + it.precioKg*(it.pesoEst/1000)*it.qty*PCT_SENIA, 0)
  const totalEst = items.reduce((a,it)=>a + it.precioKg*(it.pesoEst/1000)*it.qty, 0)
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(36,26,23,.4)',zIndex:90,backdropFilter:'blur(2px)'}}/>
      <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(420px,100vw)',background:C.bg,zIndex:100,boxShadow:'-10px 0 40px rgba(36,26,23,.2)',display:'flex',flexDirection:'column',animation:'slideIn .3s cubic-bezier(.2,.7,.3,1)'}}>
        <div style={{padding:'20px 22px',borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h3 style={{fontFamily:'Fraunces,serif',fontSize:22,fontWeight:600,color:C.ink}}>Tu pedido</h3>
          <button onClick={onClose} className="btn" style={{background:'none',border:'none',fontSize:24,color:C.faint,cursor:'pointer',lineHeight:1}}>×</button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'16px 22px'}}>
          {items.length===0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:C.faint}}>
              <div style={{fontSize:36,marginBottom:12}}>🛒</div>
              Tu pedido está vacío
            </div>
          ) : items.map(it=>(
            <div key={it.id} style={{display:'flex',gap:12,padding:'14px 0',borderBottom:`1px solid ${C.line}`}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:C.ink}}>{it.nombre}</div>
                <div style={{fontSize:11.5,color:C.faint,marginTop:2}}>{fmt(it.precioKg)}/kg · ~{it.pesoEst}g por pieza</div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:0,border:`1px solid ${C.line2}`,borderRadius:8,overflow:'hidden'}}>
                    <button onClick={()=>onQty(it.id,-1)} className="btn" style={{border:'none',background:C.surface,width:28,height:28,cursor:'pointer',fontSize:16,color:C.ink2}}>−</button>
                    <span style={{minWidth:28,textAlign:'center',fontSize:13,fontWeight:600}}>{it.qty}</span>
                    <button onClick={()=>onQty(it.id,1)} className="btn" style={{border:'none',background:C.surface,width:28,height:28,cursor:'pointer',fontSize:16,color:C.ink2}}>+</button>
                  </div>
                  <button onClick={()=>onRemove(it.id)} className="btn" style={{background:'none',border:'none',color:C.faint,fontSize:11.5,cursor:'pointer',textDecoration:'underline'}}>Quitar</button>
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'Fraunces,serif',fontSize:16,fontWeight:600,color:C.wine}}>{fmt(it.precioKg*(it.pesoEst/1000)*it.qty)}</div>
                <div style={{fontSize:10,color:C.faint}}>estimado</div>
              </div>
            </div>
          ))}
        </div>

        {items.length>0 && (
          <div style={{padding:'18px 22px',borderTop:`1px solid ${C.line}`,background:C.surface}}>
            <div style={{background:C.amberBg,borderRadius:10,padding:'10px 13px',marginBottom:14,fontSize:11.5,color:C.ink2,lineHeight:1.6}}>
              💡 La carne se cobra por <strong>peso real</strong>. Hoy pagás una <strong>seña del 30%</strong>; el saldo exacto se ajusta al pesar y lo abonás contra entrega.
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:C.ink2,marginBottom:6}}>
              <span>Total estimado</span><span style={{fontFamily:'Fraunces,serif'}}>{fmt(totalEst)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:16}}>
              <span style={{fontSize:14,fontWeight:600,color:C.ink}}>Seña a pagar hoy</span>
              <span style={{fontFamily:'Fraunces,serif',fontSize:26,fontWeight:700,color:C.green}}>{fmt(totalSenia)}</span>
            </div>
            <button onClick={onCheckout} className="btn" style={{width:'100%',background:C.wine,color:C.cream,border:'none',borderRadius:12,padding:'15px',fontSize:15,fontWeight:600,boxShadow:'0 8px 20px rgba(107,30,30,.25)'}}>
              Continuar con la entrega →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── CHECKOUT (modal) ───────────────────────────────────────────
function genVentanas() {
  const out=[], hoy=new Date(), habiles=[2,3,4,5,6]
  const franjas=[{id:'man',t:'9 a 12 hs',ic:'🌅'},{id:'tar',t:'17 a 20 hs',ic:'🌆'}]
  let off=2, dias=0
  while(dias<4){
    const d=new Date(hoy); d.setDate(hoy.getDate()+off)
    if(habiles.includes(d.getDay())){
      const lbl=d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})
      out.push({fecha:d.toISOString().slice(0,10),label:lbl.charAt(0).toUpperCase()+lbl.slice(1),franjas})
      dias++
    }
    off++
  }
  return out
}

function Checkout({ open, items, onClose, onConfirm }) {
  const [step,setStep]=useState(1)
  const [form,setForm]=useState({nombre:'',tel:'',dir:'',ventana:'',planB:'',notas:''})
  const [err,setErr]=useState('')
  const ventanas=useMemo(genVentanas,[])
  const totalSenia=items.reduce((a,it)=>a+it.precioKg*(it.pesoEst/1000)*it.qty*PCT_SENIA,0)

  useEffect(()=>{ if(open){setStep(1);setErr('')} },[open])
  if(!open) return null
  const set=(k,val)=>setForm(f=>({...f,[k]:val}))

  const next=()=>{
    if(step===1){
      if(!form.nombre.trim()||!form.tel.trim()||!form.dir.trim()){setErr('Completá nombre, teléfono y dirección.');return}
      setErr('');setStep(2)
    } else if(step===2){
      if(!form.ventana){setErr('Elegí una ventana de entrega.');return}
      if(!form.planB){setErr('Decinos qué hacemos si no estás.');return}
      setErr('');setStep(3)
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(36,26,23,.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(3px)'}}>
      <div style={{background:C.bg,borderRadius:20,maxWidth:480,width:'100%',maxHeight:'92vh',overflowY:'auto',boxShadow:'0 30px 80px rgba(36,26,23,.3)'}}>
        <div style={{padding:'20px 24px',borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:C.bg,zIndex:2}}>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {[1,2,3].map(n=>(
              <div key={n} style={{width:26,height:5,borderRadius:3,background:step>=n?C.wine:C.line2}}/>
            ))}
            <span style={{fontSize:12,color:C.faint,marginLeft:8}}>Paso {step} de 3</span>
          </div>
          <button onClick={onClose} className="btn" style={{background:'none',border:'none',fontSize:24,color:C.faint,cursor:'pointer'}}>×</button>
        </div>

        <div style={{padding:'22px 24px'}}>
          {step===1 && <>
            <h3 style={{fontFamily:'Fraunces,serif',fontSize:24,fontWeight:600,color:C.ink,marginBottom:4}}>Tus datos</h3>
            <p style={{fontSize:13,color:C.ink2,marginBottom:20}}>Para coordinar la entrega en {ZONA}.</p>
            {[['nombre','Nombre y apellido','text'],['tel','WhatsApp','tel'],['dir','Dirección (calle, número, piso/depto)','text']].map(([k,ph,ty])=>(
              <input key={k} type={ty} placeholder={ph} value={form[k]} onChange={e=>set(k,e.target.value)}
                style={{width:'100%',padding:'13px 15px',borderRadius:11,border:`1px solid ${C.line2}`,fontSize:14,marginBottom:11,outline:'none',background:C.surface,color:C.ink}}/>
            ))}
          </>}

          {step===2 && <>
            <h3 style={{fontFamily:'Fraunces,serif',fontSize:24,fontWeight:600,color:C.ink,marginBottom:4}}>Ventana de entrega</h3>
            <div style={{background:'#e9f0fb',border:'1px solid #c2d5f0',borderRadius:11,padding:'10px 13px',marginBottom:16,fontSize:12,color:'#2d5599',display:'flex',gap:8}}>
              <span>❄️</span><span>La carne viaja en frío y dura máximo 2 hs fuera de la heladera. Por eso necesitamos a alguien para recibirla.</span>
            </div>
            {ventanas.map(d=>(
              <div key={d.fecha} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>{d.label}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {d.franjas.map(f=>{
                    const id=`${d.fecha}-${f.id}`, sel=form.ventana===id
                    return <button key={id} onClick={()=>set('ventana',id)} className="btn"
                      style={{padding:'11px',borderRadius:11,border:`1.5px solid ${sel?C.wine:C.line2}`,background:sel?'#f6ecec':C.surface,cursor:'pointer',textAlign:'left'}}>
                      <div style={{fontSize:17}}>{f.ic}</div>
                      <div style={{fontSize:12.5,fontWeight:600,color:C.ink,marginTop:2}}>{f.t}</div>
                    </button>
                  })}
                </div>
              </div>
            ))}
            <div style={{fontSize:13,fontWeight:600,color:C.ink,margin:'16px 0 8px'}}>Si no estás en casa...</div>
            {[['llamar','📞 Llamame y esperá 10 min'],['vecino','🏘️ Dejalo con un vecino'],['repro','📅 Reprogramá sin cargo']].map(([id,t])=>(
              <button key={id} onClick={()=>set('planB',id)} className="btn"
                style={{display:'block',width:'100%',textAlign:'left',padding:'11px 14px',borderRadius:11,marginBottom:7,border:`1.5px solid ${form.planB===id?C.wine:C.line2}`,background:form.planB===id?'#f6ecec':C.surface,cursor:'pointer',fontSize:13,color:C.ink,fontWeight:form.planB===id?600:400}}>
                {t}
              </button>
            ))}
          </>}

          {step===3 && <>
            <h3 style={{fontFamily:'Fraunces,serif',fontSize:24,fontWeight:600,color:C.ink,marginBottom:16}}>Confirmá tu pedido</h3>
            <div style={{background:C.surface,borderRadius:13,padding:'14px 16px',marginBottom:14,border:`1px solid ${C.line}`}}>
              {items.map(it=>(
                <div key={it.id} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',color:C.ink2}}>
                  <span>{it.qty}× {it.nombre}</span>
                  <span>{fmt(it.precioKg*(it.pesoEst/1000)*it.qty)}</span>
                </div>
              ))}
              <div style={{borderTop:`1px solid ${C.line}`,marginTop:8,paddingTop:10,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontWeight:600,color:C.ink}}>Seña a pagar ahora (30%)</span>
                <span style={{fontFamily:'Fraunces,serif',fontSize:22,fontWeight:700,color:C.green}}>{fmt(totalSenia)}</span>
              </div>
            </div>
            <textarea placeholder="Notas (opcional): timbre, referencias, etc." value={form.notas} onChange={e=>set('notas',e.target.value)}
              style={{width:'100%',padding:'12px 14px',borderRadius:11,border:`1px solid ${C.line2}`,fontSize:13,minHeight:66,resize:'vertical',outline:'none',background:C.surface,marginBottom:14,fontFamily:'Archivo,sans-serif'}}/>
            <div style={{background:C.amberBg,borderRadius:11,padding:'11px 14px',fontSize:12,color:C.ink2,lineHeight:1.6,marginBottom:6}}>
              🟤→🔴 Recordá: la carne llega oscura por el envasado al vacío. Recupera su rojo en 15 min al abrir la bolsa. Es señal de frescura.
            </div>
          </>}

          {err && <div style={{background:C.redBg,border:`1px solid #e8bdbd`,borderRadius:9,padding:'9px 13px',fontSize:12.5,color:C.red,marginTop:6,marginBottom:6}}>⚠ {err}</div>}
        </div>

        <div style={{padding:'16px 24px',borderTop:`1px solid ${C.line}`,display:'flex',gap:10,position:'sticky',bottom:0,background:C.bg}}>
          {step>1 && <button onClick={()=>setStep(step-1)} className="btn" style={{flex:'0 0 auto',padding:'13px 20px',borderRadius:11,border:`1px solid ${C.line2}`,background:'transparent',color:C.ink2,fontSize:13,fontWeight:500,cursor:'pointer'}}>← Atrás</button>}
          {step<3
            ? <button onClick={next} className="btn" style={{flex:1,padding:'14px',borderRadius:11,border:'none',background:C.wine,color:C.cream,fontSize:14.5,fontWeight:600,cursor:'pointer'}}>Continuar →</button>
            : <button onClick={()=>onConfirm(form)} className="btn" style={{flex:1,padding:'14px',borderRadius:11,border:'none',background:C.green,color:C.cream,fontSize:14.5,fontWeight:600,cursor:'pointer'}}>Pagar seña con Mercado Pago →</button>}
        </div>
      </div>
    </div>
  )
}

// ─── FOOTER ─────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{background:C.ink,color:'rgba(252,250,247,.7)',padding:'48px 24px 32px',marginTop:0}}>
      <div style={{maxWidth:1100,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:40,justifyContent:'space-between'}}>
        <div style={{maxWidth:280}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <Logo size={40} light/>
            <span style={{fontFamily:'Fraunces,serif',fontSize:20,fontWeight:600,color:C.cream}}>El Retiro</span>
          </div>
          <p style={{fontSize:13,lineHeight:1.6}}>Carne premium de productor directo. De nuestro campo en Sol de Julio a tu mesa en Río Cuarto.</p>
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:C.gold,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:14}}>Contacto</div>
          <a href={`https://wa.me/${WHATSAPP}`} style={{display:'block',color:'rgba(252,250,247,.85)',textDecoration:'none',fontSize:14,marginBottom:8}}>📱 WhatsApp</a>
          <span style={{display:'block',fontSize:14,marginBottom:8}}>📍 {ZONA}</span>
          <span style={{display:'block',fontSize:14}}>🚚 Entregas mar a sáb</span>
        </div>
      </div>
      <div style={{maxWidth:1100,margin:'32px auto 0',paddingTop:24,borderTop:'1px solid rgba(252,250,247,.12)',fontSize:12,color:'rgba(252,250,247,.45)',display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <span>© 2026 El Retiro · Productor directo</span>
        <span>Sol de Julio, Santiago del Estero → Río Cuarto, Córdoba</span>
      </div>
    </footer>
  )
}

// ─── APP PRINCIPAL ──────────────────────────────────────────────
export default function App() {
  const [stock,setStock]=useState([])
  const [loading,setLoading]=useState(true)
  const [cart,setCart]=useState([])
  const [cartOpen,setCartOpen]=useState(false)
  const [checkout,setCheckout]=useState(false)
  const [toast,setToast]=useState('')

  // Stock en vivo desde Firestore (misma colección que la plataforma)
  useEffect(()=>{
    const unsub=onSnapshot(collection(db,'stock'),snap=>{
      const items=snap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(s=>s.activo!==false)
        .map(s=>({...s,pesoEst:s.pesoEst||500,desc:s.desc||''}))
      // ordenar: disponibles primero, luego por nombre
      items.sort((a,b)=>{
        const ra=(a.kgDisponible||0)-(a.kgReservado||0), rb=(b.kgDisponible||0)-(b.kgReservado||0)
        if((ra>0.3)!==(rb>0.3)) return rb>0.3?1:-1
        return (a.nombre||'').localeCompare(b.nombre||'')
      })
      setStock(items); setLoading(false)
    },()=>setLoading(false))
    return ()=>unsub()
  },[])

  const showToast=msg=>{ setToast(msg); setTimeout(()=>setToast(''),2200) }

  const addToCart=cut=>{
    setCart(prev=>{
      const ex=prev.find(i=>i.id===cut.id)
      if(ex) return prev.map(i=>i.id===cut.id?{...i,qty:i.qty+1}:i)
      return [...prev,{id:cut.id,nombre:cut.nombre,precioKg:cut.precioKg,pesoEst:cut.pesoEst||500,qty:1}]
    })
    showToast(`${cut.nombre} agregado`)
  }
  const changeQty=(id,d)=>setCart(prev=>prev.map(i=>i.id===id?{...i,qty:Math.max(1,i.qty+d)}:i))
  const removeItem=id=>setCart(prev=>prev.filter(i=>i.id!==id))
  const cartCount=cart.reduce((a,i)=>a+i.qty,0)

  const goCheckout=()=>{ setCartOpen(false); setCheckout(true) }

  const confirmOrder=async(form)=>{
    try{
      const totalSenia=cart.reduce((a,it)=>a+it.precioKg*(it.pesoEst/1000)*it.qty*PCT_SENIA,0)
      const totalEst=cart.reduce((a,it)=>a+it.precioKg*(it.pesoEst/1000)*it.qty,0)
      const pedidoId='ped-'+Date.now()
      // Guardar el pedido en Firestore (lo verás en la plataforma)
      await setDoc(doc(db,'pedidos',pedidoId),{
        cliente:{nombre:form.nombre,tel:form.tel,dir:form.dir},
        items:cart.map(it=>({id:it.id,nombre:it.nombre,precioKg:it.precioKg,pesoEst:it.pesoEst,qty:it.qty})),
        ventana:form.ventana, planB:form.planB, notas:form.notas,
        totalEstimado:totalEst, senia:totalSenia,
        estado:'pendiente_pago', creado:serverTimestamp(),
      })
      // Reservar stock (resta kg estimados)
      for(const it of cart){
        try{
          await runTransaction(db,async tx=>{
            const ref=doc(db,'stock',it.id)
            const s=await tx.get(ref)
            if(s.exists()){
              const kg=(it.pesoEst/1000)*it.qty
              tx.update(ref,{kgReservado:(s.data().kgReservado||0)+kg})
            }
          })
        }catch(e){}
      }
      // Mensaje de WhatsApp con el resumen (mientras se configura MP backend)
      const lineas=cart.map(it=>`• ${it.qty}× ${it.nombre} (~${it.pesoEst}g) — ${fmt(it.precioKg*(it.pesoEst/1000)*it.qty)}`).join('%0A')
      const msg=`Hola! Quiero confirmar mi pedido en El Retiro:%0A%0A${lineas}%0A%0ATotal estimado: ${fmt(totalEst)}%0ASeña (30%): ${fmt(totalSenia)}%0A%0ANombre: ${form.nombre}%0ADirección: ${form.dir}%0AEntrega: ${form.ventana}%0A%0AQuiero pagar la seña por Mercado Pago.`
      window.open(`https://wa.me/${WHATSAPP}?text=${msg}`,'_blank')
      setCheckout(false); setCart([])
      showToast('¡Pedido registrado! Te redirigimos a WhatsApp')
    }catch(e){
      showToast('Hubo un error, probá de nuevo')
    }
  }

  return (
    <div className="grain" style={{minHeight:'100vh',position:'relative'}}>
      <style>{GS}</style>
      <div style={{position:'relative',zIndex:2}}>
        <Header cartCount={cartCount} onCart={()=>setCartOpen(true)}/>
        <Hero/>
        <Catalog stock={stock} loading={loading} onAdd={addToCart}/>
        <Viaje/>
        <Footer/>
      </div>

      <Cart open={cartOpen} items={cart} onClose={()=>setCartOpen(false)} onQty={changeQty} onRemove={removeItem} onCheckout={goCheckout}/>
      <Checkout open={checkout} items={cart} onClose={()=>setCheckout(false)} onConfirm={confirmOrder}/>

      {toast && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:C.ink,color:C.cream,padding:'13px 24px',borderRadius:30,fontSize:14,fontWeight:500,zIndex:300,boxShadow:'0 10px 30px rgba(36,26,23,.3)',animation:'fadeUp .3s'}}>{toast}</div>}
    </div>
  )
}
