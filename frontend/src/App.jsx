import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Link as LinkIcon, Sparkles, Image as ImageIcon, CheckSquare,
  ArrowRight, TrendingUp, Clock, Flame, ChevronUp, ChevronDown, ExternalLink
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const API_BASE = 'https://pricetracker-production-10a2.up.railway.app/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'publish' | 'monitor_list' | 'monitor_detail'
  const [wizardStep, setWizardStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [chartData, setChartData] = useState([]); // <-- NUEVO ESTADO PARA LA GRÁFICA
  const [rawHtml, setRawHtml] = useState('');
  const [showHtml, setShowHtml] = useState(false); // Controla si el visor está abierto
  // Nuevos estados
  const [activePickerField, setActivePickerField] = useState(null); // 'title', 'price', 'image_url', etc.
  // Escuchar clics del Iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'ELEMENT_PICKED') {
        if (!activePickerField) {
          alert('Primero selecciona qué dato quieres extraer haciendo clic en uno de los botones azules del panel derecho.');
          return;
        }

        let value = event.data.text?.trim() || '';

        // Si estamos buscando una imagen
        if (activePickerField === 'image_url') {
          value = event.data.src || '';
          // Limpiar si viene como url("...") de un background
          if (value.includes('url(')) {
            value = value.match(/url\(["']?(.*?)["']?\)/)[1];
          }
          if (!value) alert('El elemento seleccionado no contiene una imagen válida.');
        }

        // Limpieza básica si es un precio
        if (activePickerField === 'price' || activePickerField === 'original_price') {
          value = value.replace(/[^0-9.,]/g, '');
        }

        // Actualizar el formulario y apagar el modo de selección
        setFormData(prev => ({ ...prev, [activePickerField]: value }));
        setActivePickerField(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activePickerField]);


  // 1. Nuevo estado para el Sidebar
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // 2. Efecto para colapsar automáticamente en el Scraper Visual (Paso 2)
  useEffect(() => {
    if (wizardStep === 2) {
      setIsSidebarCollapsed(true);
    } else {
      setIsSidebarCollapsed(false);
    }
  }, [wizardStep]);

  // Datos del formulario
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    price: '',
    original_price: '',
    coupon_code: '',
    store: '',
    image_url: '',
    description: '',
    monitor_interval_minutes: 15,
  });

  // Cargar productos de la BD
  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/products`);
      setProducts(res.data);
    } catch (err) {
      console.error("Error cargando productos:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [activeTab]);

  // Manejar Scraping del Link
  const handleScrapeLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/products/scrape-analyze`, { url: formData.url });
      if (res.data.scraped_data) {
        setFormData(prev => ({
          ...prev,
          title: res.data.scraped_data.title || '',
          price: res.data.scraped_data.price || '',
          original_price: res.data.scraped_data.original_price || '',
          image_url: res.data.scraped_data.image_url || '',
          store: res.data.scraped_data.store || '',
        }));
        // Guardar el HTML para depuración
        setRawHtml(res.data.scraped_data.raw_html || '');
      }
      setLoading(false);
      setWizardStep(2);
      if (res.data.status === 'failed') {
        alert(res.data.message || "No se pudieron extraer los datos; ingrésalos manualmente.");
      }
    } catch (error) {
      setLoading(false);
      const message = error.response?.data?.message || "Error extrayendo datos, ingresa manualmente.";
      alert(message);
      setWizardStep(2);
    }
  };

  // Cargar el historial real del producto
  const handleSelectProduct = async (item) => {
    setSelectedProduct(item);
    setActiveTab('monitor_detail');
    setChartData([]); // Limpiamos la gráfica anterior

    try {
      const res = await axios.get(`${API_BASE}/products/${item.id}/history`);

      // Transformamos la fecha de MySQL a un formato bonito para la gráfica (Ej: "13/10 18:30")
      const formattedData = res.data.map(record => {
        const d = new Date(record.created_at);
        const timeString = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        return {
          time: timeString,
          price: Number(record.price)
        };
      });

      setChartData(formattedData);
    } catch (err) {
      console.error("Error cargando historial de precios:", err);
    }
  };

  // Manejar Guardado Final
  const handlePublish = async () => {
    try {
      await axios.post(`${API_BASE}/products`, {
        ...formData,
        affiliate_url: formData.url,
      });
      alert('¡Oferta publicada exitosamente!');

      // Reiniciar formulario y volver al inicio
      setFormData({
        url: '', title: '', price: '', original_price: '', coupon_code: '',
        store: '', image_url: '', description: '', monitor_interval_minutes: 15
      });
      setWizardStep(1);
      setActiveTab('feed');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      alert('Error guardando la oferta:\n\n' + errorMsg);
    }
  };

  const getProcessedHtml = (rawHtml, baseUrl) => {
    if (!rawHtml) return '';

    // Inyectar etiqueta base para que las imágenes y CSS carguen con rutas relativas
    let processed = rawHtml.replace('<head>', `<head><base href="${baseUrl}">`);

    // Inyectar CSS y JS del Inspector Visual
    const inspectorScript = `
    <style>
      .picker-hover { 
        outline: 3px dashed #00FF41 !important; 
        cursor: crosshair !important; 
        background-color: rgba(0, 255, 65, 0.2) !important; 
        transition: all 0.1s;
      }
      .picker-selected { 
        outline: 3px solid #FF00FF !important; 
        background-color: rgba(255, 0, 255, 0.2) !important; 
      }
      /* Desactivar enlaces para no salir del iframe al hacer clic */
      a { pointer-events: none !important; }
    </style>
    <script>
      document.addEventListener('mouseover', (e) => {
        e.target.classList.add('picker-hover');
      }, true);

      document.addEventListener('mouseout', (e) => {
        e.target.classList.remove('picker-hover');
      }, true);

      document.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Enviar datos del elemento al React padre
        window.parent.postMessage({
          type: 'ELEMENT_PICKED',
          text: e.target.innerText || e.target.textContent,
          src: e.target.src || e.target.getAttribute('data-src') || e.target.currentSrc || e.target.style.backgroundImage,
          tagName: e.target.tagName
        }, '*');

        // Efecto visual de selección
        document.querySelectorAll('.picker-selected').forEach(el => el.classList.remove('picker-selected'));
        e.target.classList.add('picker-selected');
      }, true);
    </script>
  `;

    return processed.replace('</body>', inspectorScript + '</body>');
  };

  // VISTA 1: FEED DE OFERTAS
  const renderFeed = () => (
    <div className="min-h-screen bg-[#121212] px-3 py-4 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-5 border-b border-[#2A2A2A] pb-6 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Price Tracker</p>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Ofertas Destacadas</h1>
            <p className="mt-2 text-sm text-[#888]">Descubre, comparte y monitorea los mejores precios.</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
          <button onClick={() => setActiveTab('monitor_list')} className="flex items-center gap-2 rounded-xl border border-[#333] bg-[#1A1A1A] px-4 py-2.5 text-sm font-bold text-cyan-400 transition-colors hover:border-cyan-500/60 hover:bg-[#222]">
            <TrendingUp className="w-4 h-4" /> Historial de Precios
          </button>
          <button
            onClick={() => setActiveTab('publish')}
            className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-[#071014] shadow-[0_8px_24px_rgba(6,182,212,0.18)] transition-colors hover:bg-cyan-400"
          >
            + Publicar Oferta
          </button>
          </div>
        </header>

      <div className="space-y-3 sm:space-y-4">
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#3A3A3A] bg-[#1A1A1A] px-5 py-16 text-center text-[#888]">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-cyan-500" />
            <p className="font-semibold text-[#CCC]">Todavía no hay ofertas registradas.</p>
            <p className="mt-1 text-sm">Haz clic en “+ Publicar Oferta” para comenzar.</p>
          </div>
        ) : (
          products.map((item) => (
            <article key={item.id} className="group flex overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] shadow-lg transition-all hover:-translate-y-0.5 hover:border-cyan-500/50 hover:shadow-[0_12px_35px_rgba(0,0,0,0.25)]">
              {/* Votómetro */}
              <div className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 border-r border-[#2A2A2A] bg-[#151515] px-1 sm:w-16 sm:gap-2 sm:px-3">
                <button aria-label="Votar positivo" className="rounded-lg p-1 text-[#666] transition-colors hover:bg-[#252525] hover:text-cyan-400"><ChevronUp className="h-5 w-5" /></button>
                <div className="flex flex-col text-center">
                  <span className="text-xs font-black text-cyan-400 sm:text-sm">+{item.degrees || 100}°</span>
                  <Flame className="mx-auto mt-1 h-4 w-4 text-cyan-400" />
                </div>
                <button aria-label="Votar negativo" className="rounded-lg p-1 text-[#666] transition-colors hover:bg-[#252525] hover:text-cyan-400"><ChevronDown className="h-5 w-5" /></button>
              </div>

              {/* Imagen */}
              <div className="flex h-32 w-28 shrink-0 items-center justify-center border-r border-[#2A2A2A] bg-white p-2 sm:h-44 sm:w-44">
                <img src={item.image_url || 'https://via.placeholder.com/150'} alt={item.title} className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" />
              </div>

              {/* Info */}
              <div className="flex min-w-0 flex-1 flex-col justify-between p-3 sm:p-5">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-[#292929] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#BDBDBD]">{item.store || 'Tienda'}</span>
                  </div>
                  <h2 className="line-clamp-3 text-base font-extrabold leading-snug text-white sm:text-lg">{item.title}</h2>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-black text-cyan-400 sm:text-2xl">${item.price}</span>
                    {item.original_price && <span className="text-xs text-[#888] line-through sm:text-sm">${item.original_price}</span>}
                  </div>
                  <a href={item.affiliate_url} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-2 rounded-lg border border-[#444] bg-[#252525] px-3 py-2 text-xs font-bold text-white transition-colors hover:border-cyan-500/50 hover:bg-[#333]">
                    Ir a la oferta <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      </div>
    </div>
  );

  // VISTA 2: FORMULARIO WIZARD MEJORADO
  const renderPublishWizard = () => (
    <div className="min-h-screen bg-[#121212] lg:flex lg:h-screen lg:overflow-hidden">
      {/* MENU LATERAL (SIDEBAR) */}
      <aside
        className={`sticky top-0 z-30 flex w-full shrink-0 flex-row border-b border-[#2A2A2A] bg-[#151515]/95 backdrop-blur transition-all duration-300 ease-in-out lg:h-screen lg:flex-col lg:border-b-0 lg:border-r ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
          }`}
      >
        {/* Cabecera del Sidebar */}
        <div className="flex shrink-0 items-center justify-between gap-3 p-3 sm:p-4 lg:p-6">
          {!isSidebarCollapsed && (
            <h2 className="hidden whitespace-nowrap text-lg font-black tracking-tight text-white sm:block lg:text-xl">
              Envía tu oferta
            </h2>
          )}
          {/* Botón manual para colapsar/expandir */}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="rounded-lg p-2 text-[#888] transition-colors hover:bg-[#252525] hover:text-cyan-400 lg:mx-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Lista de Pasos */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 sm:gap-2 sm:px-2 lg:mt-4 lg:flex-col lg:items-stretch lg:gap-2 lg:overflow-visible lg:px-4">

          {/* Paso 1: Link */}
          <div className={`flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-bold transition-colors sm:px-3 sm:text-sm lg:justify-start ${wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-400' : 'text-[#888]'}`}>
            <LinkIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Link</span>}
          </div>

          {/* Paso 2: Esenciales */}
          <div className={`flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-bold transition-colors sm:px-3 sm:text-sm lg:justify-start ${wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-400' : 'text-[#888]'}`}>
            <Sparkles className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Esenciales</span>}
          </div>

          {/* Paso 3: Imágenes */}
          <div className={`flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-bold transition-colors sm:px-3 sm:text-sm lg:justify-start ${wizardStep === 3 ? 'bg-cyan-500/10 text-cyan-400' : 'text-[#888]'}`}>
            <ImageIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Imágenes</span>}
          </div>

          {/* Paso 4: Monitoreo */}
          <div className={`flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-bold transition-colors sm:px-3 sm:text-sm lg:justify-start ${wizardStep === 4 ? 'bg-cyan-500/10 text-cyan-400' : 'text-[#888]'}`}>
            <Clock className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Monitoreo</span>}
          </div>

          {/* Paso 5: Revisión */}
          <div className={`flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 text-xs font-bold transition-colors sm:px-3 sm:text-sm lg:justify-start ${wizardStep === 5 ? 'bg-cyan-500/10 text-cyan-400' : 'text-[#888]'}`}>
            <CheckSquare className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Revisión</span>}
          </div>

        </nav>

        {/* Botón de Cancelar / Volver abajo */}
        <div className="hidden border-t border-[#2A2A2A] p-4 lg:block">
          <button
            onClick={() => {
              setActiveTab('feed');
              setWizardStep(1);
              setActivePickerField(null);
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl p-3 font-bold text-[#888] transition-colors hover:bg-[#222] hover:text-white"
          >
            <div className="shrink-0">←</div>
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Cancelar y volver</span>}
          </button>
        </div>
      </aside>

      {/* Contenido Central */}
      <main className="min-w-0 p-3 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-10">
        <div className={`mx-auto w-full ${wizardStep === 2 ? 'max-w-[1800px]' : 'max-w-3xl'}`}>

          {/* PASO 1 */}
          {wizardStep === 1 && (
            <div className="mx-auto w-full max-w-2xl space-y-6 text-center animate-fade-in">
              <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-[2.5rem]">Comparte una oferta con millones de personas</h1>
              <p className="mb-8 text-base text-[#A0A0A0] sm:text-lg">Pega el link donde se puede comprar la oferta o encontrar más información</p>

              <form onSubmit={handleScrapeLink} className="relative mt-10">
                <div className={`flex items-center bg-[#1A1A1A] border ${formData.url ? 'border-cyan-500' : 'border-[#333]'} rounded-2xl overflow-hidden transition-all focus-within:border-cyan-500 p-1.5 shadow-lg`}>
                  <div className="pl-4 pr-3 text-[#777]"><LinkIcon className="w-5 h-5" /></div>
                  <input
                    type="url" required value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="flex-1 bg-transparent py-3.5 outline-none text-white text-base placeholder-[#666]"
                    placeholder="https://www.pagina.com/oferta..."
                  />
                  <button
                    type="submit" disabled={!formData.url || loading}
                    className={`mr-1 px-6 py-3 rounded-xl font-bold text-sm transition-colors ${formData.url && !loading ? 'bg-[#333] hover:bg-[#444] text-white' : 'bg-transparent text-[#555] cursor-not-allowed'
                      }`}
                  >
                    ¡Empecemos!
                  </button>
                </div>
                {loading && (
                  <div className="absolute -bottom-4 left-0 w-full h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 w-2/3 animate-pulse rounded-full"></div>
                  </div>
                )}
              </form>
              <div className="mt-10">
                <button onClick={() => setWizardStep(2)} className="text-sm font-bold text-[#888] hover:text-white transition-colors">
                  No se necesita link
                </button>
              </div>
            </div>

          )}

          {/* PASO 2 */}
          {wizardStep === 2 && (
            <div className="grid h-auto min-h-0 grid-cols-1 gap-4 xl:h-[calc(100vh-3rem)] xl:min-h-[620px] xl:grid-cols-[minmax(0,1fr)_410px] xl:gap-5">

              {/* COLUMNA IZQUIERDA: Iframe de la Tienda */}
              <section className="flex min-h-[55vh] flex-col overflow-hidden rounded-2xl border border-[#333] bg-[#202020] shadow-2xl xl:min-h-0">
                <div className="flex shrink-0 items-center gap-2 border-b border-[#333] bg-[#181818] px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="ml-2 min-w-0 flex-1 truncate rounded-lg border border-[#333] bg-[#101010] px-3 py-1.5 text-xs text-[#999]">
                    {formData.url || 'Vista previa de la oferta'}
                  </div>
                  <span className="hidden text-xs text-cyan-400 sm:block">Vista previa</span>
                </div>

                <div className="relative min-h-0 flex-1 bg-[#e8e8e8] p-2 sm:p-3">
                  <div className="h-full w-full overflow-hidden rounded-lg bg-white shadow-inner">
                    {!rawHtml ? (
                      <div className="flex h-full items-center justify-center p-8 text-center text-sm font-semibold text-[#555]">
                        <div>
                          <Sparkles className="mx-auto mb-3 h-8 w-8 text-cyan-500" />
                          <p>Completa los datos de la oferta para ver la vista previa.</p>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        srcDoc={getProcessedHtml(rawHtml, formData.url)}
                        className="h-full w-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                        title="Visual Scraper"
                      />
                    )}
                  </div>

                  {/* Banner flotante que indica qué se está seleccionando */}
                  {activePickerField && (
                    <div className="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full bg-cyan-500 px-5 py-2 text-center text-xs font-bold text-black shadow-lg animate-pulse">
                      Haz clic en el {activePickerField.replace('_', ' ')} dentro de la página
                    </div>
                  )}
                </div>
              </section>

              {/* COLUMNA DERECHA: Panel de Datos */}
              <section className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-[#333] bg-[#1A1A1A] p-4 shadow-xl sm:p-6">
                <h2 className="text-xl font-bold text-cyan-400 mb-2">Panel de Extracción</h2>
                <p className="text-xs text-[#888] mb-6">Selecciona el botón azul y haz clic en el elemento correspondiente en la vista previa.</p>

                {/* Campos Dinámicos */}
                <div className="space-y-4">

                  {/* Título */}
                  <div>
                    <button
                      onClick={() => setActivePickerField('title')}
                      className={`text-xs font-bold px-3 py-1 rounded mb-1 w-full text-left transition-colors ${activePickerField === 'title' ? 'bg-cyan-500 text-black' : 'bg-[#333] text-cyan-400 hover:bg-[#444]'}`}
                    >
                      ◎ Capturar Título
                    </button>
                    <textarea value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full bg-black border border-[#444] rounded p-2 text-sm text-white focus:border-cyan-500 outline-none" rows="2" />
                  </div>

                  {/* Precio */}
                  <div>
                    <button
                      onClick={() => setActivePickerField('price')}
                      className={`text-xs font-bold px-3 py-1 rounded mb-1 w-full text-left transition-colors ${activePickerField === 'price' ? 'bg-cyan-500 text-black' : 'bg-[#333] text-cyan-400 hover:bg-[#444]'}`}
                    >
                      ◎ Capturar Precio Oferta
                    </button>
                    <input type="text" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className="w-full bg-black border border-[#444] rounded p-2 text-sm text-emerald-400 font-bold outline-none" />
                  </div>

                  {/* Precio Original */}
                  <div>
                    <button
                      onClick={() => setActivePickerField('original_price')}
                      className={`text-xs font-bold px-3 py-1 rounded mb-1 w-full text-left transition-colors ${activePickerField === 'original_price' ? 'bg-cyan-500 text-black' : 'bg-[#333] text-cyan-400 hover:bg-[#444]'}`}
                    >
                      ◎ Capturar Precio Regular (Sin descuento)
                    </button>
                    <input type="text" value={formData.original_price} onChange={e => setFormData({ ...formData, original_price: e.target.value })} className="w-full bg-black border border-[#444] rounded p-2 text-sm text-gray-400 line-through outline-none" />
                  </div>

                  {/* Imagen */}
                  <div>
                    <button
                      onClick={() => setActivePickerField('image_url')}
                      className={`text-xs font-bold px-3 py-1 rounded mb-1 w-full text-left transition-colors ${activePickerField === 'image_url' ? 'bg-cyan-500 text-black' : 'bg-[#333] text-cyan-400 hover:bg-[#444]'}`}
                    >
                      ◎ Capturar Imagen
                    </button>
                    <input type="text" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="w-full bg-black border border-[#444] rounded p-2 text-sm text-white outline-none mb-2" />
                    {formData.image_url && <img src={formData.image_url} alt="Preview" className="w-24 h-24 object-contain bg-white rounded border border-[#444]" />}
                  </div>

                  {/* Descripción */}
                  <div>
                    <button
                      onClick={() => setActivePickerField('description')}
                      className={`text-xs font-bold px-3 py-1 rounded mb-1 w-full text-left transition-colors ${activePickerField === 'description' ? 'bg-cyan-500 text-black' : 'bg-[#333] text-cyan-400 hover:bg-[#444]'}`}
                    >
                      ◎ Capturar Descripción
                    </button>
                    <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-black border border-[#444] rounded p-2 text-sm text-[#AAA] outline-none" rows="3" />
                  </div>

                </div>

                <div className="mt-auto pt-6 flex gap-3">
                  <button onClick={() => setWizardStep(1)} className="px-4 py-2 border border-[#444] rounded font-bold text-[#888] hover:text-white">Atrás</button>
                  <button onClick={handlePublish} className="flex-1 bg-cyan-500 text-black rounded font-bold hover:bg-cyan-400 shadow-[0_0_15px_rgba(0,255,65,0.3)]">Guardar y Monitorear</button>
                </div>
              </section>
            </div>
          )}

          {/* PASO 3 */}
          {wizardStep === 3 && (
            <div className="space-y-8 animate-fade-in w-full max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Imágenes</h2>
              <p className="text-[#A0A0A0] text-base mb-8">Sube imágenes para publicar tu oferta o utiliza la extraída automáticamente.</p>
              <div className="w-56 h-56 border-2 border-cyan-500 rounded-2xl overflow-hidden relative bg-white p-2">
                <img src={formData.image_url || 'https://via.placeholder.com/150'} alt="Main" className="w-full h-full object-contain" />
                <div className="absolute bottom-0 left-0 w-full bg-cyan-500 text-white text-center text-sm font-bold py-2">Imagen principal</div>
              </div>
              <div className="flex justify-between mt-12 pt-6 border-t border-[#2A2A2A]">
                <button onClick={() => setWizardStep(2)} className="border border-[#444] text-[#CCC] px-8 py-3 rounded-full hover:bg-[#2A2A2A] transition-colors font-semibold text-sm">Atrás</button>
                <button onClick={() => setWizardStep(4)} className="bg-transparent border border-cyan-600 text-cyan-500 hover:bg-cyan-900/20 px-8 py-3 rounded-full flex items-center gap-2 transition-colors font-bold text-sm">Siguiente <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* PASO 4 */}
          {wizardStep === 4 && (
            <div className="space-y-8 animate-fade-in w-full max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Monitoreo Automático</h2>
              <p className="text-[#A0A0A0] text-base mb-8">Elige cada cuánto tiempo quieres que el sistema revise el precio para la gráfica histórica.</p>
              <div className="bg-[#1A1A1A] border border-[#333] p-8 rounded-2xl">
                <label className="text-sm font-semibold text-[#E0E0E0] block mb-4">Frecuencia (Minutos)</label>
                <select
                  value={formData.monitor_interval_minutes}
                  onChange={(e) => setFormData({ ...formData, monitor_interval_minutes: parseInt(e.target.value) })}
                  className="w-full bg-[#121212] border border-[#444] rounded-xl p-4 text-white outline-none focus:border-cyan-500 appearance-none font-medium"
                >
                  <option value={10}>Cada 10 minutos (Alta prioridad)</option>
                  <option value={15}>Cada 15 minutos (Sugerido)</option>
                  <option value={20}>Cada 20 minutos</option>
                  <option value={60}>Cada 1 hora</option>
                </select>
              </div>
              <div className="flex justify-between mt-12 pt-6 border-t border-[#2A2A2A]">
                <button onClick={() => setWizardStep(3)} className="border border-[#444] text-[#CCC] px-8 py-3 rounded-full hover:bg-[#2A2A2A] transition-colors font-semibold text-sm">Atrás</button>
                <button onClick={() => setWizardStep(5)} className="bg-transparent border border-cyan-600 text-cyan-500 hover:bg-cyan-900/20 px-8 py-3 rounded-full flex items-center gap-2 transition-colors font-bold text-sm">Siguiente <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {/* PASO 5 */}
          {wizardStep === 5 && (
            <div className="space-y-6 animate-fade-in text-center w-full max-w-2xl mx-auto">
              <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckSquare className="w-10 h-10 text-cyan-500" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">Todo listo para publicar</h2>
              <p className="text-[#A0A0A0] text-lg mb-12">La oferta entrará al feed y su precio se monitoreará cada {formData.monitor_interval_minutes} minutos.</p>
              <div className="flex justify-center gap-6">
                <button onClick={() => setWizardStep(4)} className="border border-[#444] text-[#CCC] px-8 py-3 rounded-full hover:bg-[#2A2A2A] transition-colors font-semibold text-sm">Revisar de nuevo</button>
                <button onClick={handlePublish} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-10 py-3 rounded-full transition-all shadow-lg shadow-cyan-900/30">
                  Publicar Oferta
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );

  // VISTA 3: LISTA MONITOREO
  const renderMonitorList = () => (
    <div className="max-w-4xl mx-auto py-8">
      <button onClick={() => setActiveTab('feed')} className="text-[#A0A0A0] hover:text-white mb-6 flex items-center gap-2 text-sm font-medium transition-colors">
        ← Volver al Feed
      </button>
      <h1 className="text-2xl font-bold text-white mb-8">Historial de Precios</h1>
      <div className="grid gap-4">
        {products.map(item => (
          <div
            key={item.id}
            onClick={() => { handleSelectProduct(item); setActiveTab('monitor_detail'); }}
            className="bg-[#1A1A1A] border border-[#2A2A2A] p-4 rounded-2xl flex items-center gap-5 cursor-pointer hover:border-cyan-500/50 transition-colors shadow-sm"
          >
            <div className="w-16 h-16 bg-white rounded-xl p-1 shrink-0">
              <img src={item.image_url} alt="prod" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1">
              <h3 className="text-[#E0E0E0] font-bold text-sm line-clamp-1">{item.title}</h3>
              <p className="text-cyan-400 font-extrabold text-lg mt-1">${item.price}</p>
            </div>
            <div className="text-right pl-4">
              <TrendingUp className="w-5 h-5 text-cyan-500 ml-auto mb-1" />
              <span className="text-xs text-[#777] font-medium">Cada {item.monitor_interval_minutes} min</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // VISTA 4: GRÁFICA MONITOREO
  // VISTA 4: GRÁFICA MONITOREO
  const renderMonitorDetail = () => {
    if (!selectedProduct) return null;

    // Aquí calculamos el precio más bajo real
    const lowestPrice = chartData.length > 0 ? Math.min(...chartData.map(d => d.price)) : selectedProduct.price;

    return (
      <div className="max-w-4xl mx-auto py-8">
        <button onClick={() => setActiveTab('monitor_list')} className="text-[#A0A0A0] hover:text-white mb-6 flex items-center gap-2 text-sm font-medium transition-colors">
          ← Volver a la lista
        </button>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 mb-8 flex gap-6 shadow-lg">
          <div className="w-32 h-32 bg-white rounded-xl p-2 shrink-0">
            <img src={selectedProduct.image_url} alt="prod" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <span className="bg-[#2A2A2A] text-[#CCC] px-2.5 py-1 rounded text-xs font-semibold">{selectedProduct.store}</span>
            <h1 className="text-xl font-bold text-white mt-3 leading-tight">{selectedProduct.title}</h1>
            <p className="text-sm text-[#888] mt-2 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Monitoreo activo: Cada {selectedProduct.monitor_interval_minutes} minutos</p>

            <div className="mt-5 flex gap-10 border-t border-[#2A2A2A] pt-4">
              <div>
                <p className="text-[11px] text-[#777] uppercase font-bold tracking-wider mb-1">Precio Actual</p>
                <p className="text-2xl font-extrabold text-white">${selectedProduct.price}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#777] uppercase font-bold tracking-wider mb-1">Precio Histórico Más Bajo</p>
                <p className="text-2xl font-extrabold text-emerald-400">${lowestPrice}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 h-96 shadow-lg">
          <h3 className="text-sm font-bold text-[#E0E0E0] mb-8 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-500" /> Tendencia de Precio
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>  {/* <-- AQUÍ USAMOS chartData */}
              <CartesianGrid strokeDasharray="4 4" stroke="#2A2A2A" vertical={false} />
              <XAxis dataKey="time" stroke="#666" fontSize={12} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} dx={-10} tickFormatter={(v) => `$${v}`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#121212', border: '1px solid #333', borderRadius: '12px', color: '#FFF' }}
                itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }}
              />
              <Line type="monotone" dataKey="price" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };
  return (
    <div className="min-h-screen bg-[#121212] text-slate-100 font-sans">
      {activeTab === 'feed' && renderFeed()}
      {activeTab === 'publish' && renderPublishWizard()}
      {activeTab === 'monitor_list' && renderMonitorList()}
      {activeTab === 'monitor_detail' && renderMonitorDetail()}
    </div>
  );
}

// Botones de Navegación Lateral (Sidebar)
function WizardNavButton({ step, currentStep, icon, label }) {
  const isActive = step === currentStep;
  const isPast = step < currentStep;

  return (
    <div className={`flex items-center gap-4 px-5 py-3.5 rounded-[20px] transition-all cursor-default ${isActive
      ? 'bg-[#2A2A2A] text-white shadow-sm'
      : isPast
        ? 'text-cyan-500'
        : 'text-[#777777]'
      }`}>
      <div className={`w-6 h-6 flex items-center justify-center ${isActive ? 'text-white' : isPast ? 'text-cyan-500' : 'text-[#777777]'
        }`}>
        {isPast ? <CheckSquare className="w-5 h-5" /> : icon}
      </div>
      <span className={`text-[15px] ${isActive ? 'font-bold' : 'font-semibold'}`}>
        {label}
      </span>
    </div>
  );
}