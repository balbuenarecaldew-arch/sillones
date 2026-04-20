import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, getSettings, getHome, getInitialProducts, listenVisibleProducts, listenAllProducts, saveProduct, removeProduct, saveHome, saveSettings, reorderProducts, isAdmin } from "./firebase.js";
import { createUploadWidget } from "./cloudinary.js";

const DEFAULTS = {
  whatsapp: "541161348000",
  direccion: "Buenos Aires, Argentina",
  horario: "Lunes a sabado de 9 a 19 hs",
  bannerTexto: "Renova tu living con sillones listos para enamorar.",
  bannerBoton: "Hablar por WhatsApp",
  bannerImagen: "hero-portada.png",
  autoReply: `¡Hola! Gracias por escribir a Sillones FB 🙌
Ya recibimos tu consulta por el modelo que viste en la web.

En un momento te respondemos con:
• precio actualizado
• medidas
• colores disponibles
• tiempo de entrega

Si querés, también podés adelantarnos tu zona y el color que te interesa para ayudarte más rápido.`
};
const DELETE_SECRET = "SILLONESFB";

const CATEGORIES = ["Todos", "Esquinero .. sillon L | doble", "Esquinero .. sillon L .. individuales", "Respaldos", "Bauleras", "Puff", "Sillas", "Materas", "Lahista para cejas", "Butacones", "Sillones a medida", "OTROS"];
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const LOCAL_BANNER = "logo-banner.png";
const THEMES = new Set(["light", "dark"]);

function sanitizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function money(value) {
  return currency.format(Number(value || 0));
}

function resolveTheme(value) {
  return THEMES.has(value) ? value : "light";
}

function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.body.dataset.theme = resolved;
  try {
    localStorage.setItem("sillones-fb-theme", resolved);
  } catch (error) {
    console.warn("No se pudo persistir el tema localmente.", error);
  }
}

function navigateToCatalog(pushHistory = true) {
  const catalogSection = qs("#catalogo");
  if (!catalogSection) return;
  const targetUrl = `${window.location.pathname}${window.location.search}#catalogo`;
  if (pushHistory) {
    history.pushState({ sillonesFbGuard: true, step: "catalogo" }, "", targetUrl);
  } else {
    history.replaceState({ ...(history.state || {}), sillonesFbGuard: true, step: "catalogo" }, "", targetUrl);
  }
  catalogSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupBackToCatalog() {
  const catalogSection = qs("#catalogo");
  if (!catalogSection) return;
  let lastBackPressAt = 0;
  let allowExit = false;

  const currentState = history.state || {};
  if (!currentState.sillonesFbGuard) {
    history.replaceState({ ...currentState, sillonesFbGuard: true, step: "home" }, "", window.location.href);
    history.pushState({ sillonesFbGuard: true, step: "guard" }, "", window.location.href);
  }

  window.addEventListener("popstate", () => {
    if (allowExit) {
      allowExit = false;
      return;
    }

    const isInCatalog = window.location.hash === "#catalogo";
    const now = Date.now();

    if (!isInCatalog) {
      navigateToCatalog(false);
      history.pushState({ sillonesFbGuard: true, step: "guard" }, "", window.location.href);
      lastBackPressAt = now;
      createToast("Tocá atrás otra vez para salir");
      return;
    }

    if (now - lastBackPressAt < 1400) {
      allowExit = true;
      history.back();
      return;
    }

    lastBackPressAt = now;
    createToast("Tocá atrás otra vez para salir");
    history.pushState({ sillonesFbGuard: true, step: "guard" }, "", window.location.href);
  });
}

function setupCatalogLinks() {
  const uniqueLinks = new Set([
    ...qsa("#hero-catalog-button"),
    ...qsa('a[href="#catalogo"]')
  ]);

  uniqueLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToCatalog(true);
    });
  });
}

function resolveImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULTS.bannerImagen;
  if (raw.includes("galeria%20de%20fotos/")) {
    return DEFAULTS.bannerImagen;
  }
  if (raw.includes("galeria de fotos/")) {
    return DEFAULTS.bannerImagen;
  }
  if (raw.includes("brand-banner.svg")) {
    return DEFAULTS.bannerImagen;
  }
  return raw;
}

function attachImageFallback(image, fallback = DEFAULTS.bannerImagen) {
  if (!image) return;
  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.src = fallback;
  });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProductCode(product = {}, fallbackId = "") {
  if (product.codigo?.trim()) return product.codigo.trim().toUpperCase();
  if (fallbackId) return `FB-${fallbackId.slice(0, 6).toUpperCase()}`;
  return `FB-${Date.now().toString().slice(-6)}`;
}

function buildProductUrl(product = {}) {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const anchor = product.codigo ? `producto-${slugify(product.codigo)}` : "catalogo";
  return `${baseUrl}#${anchor}`;
}

function buildWhatsAppUrl(phone, product = null) {
  const cleanPhone = sanitizePhone(phone) || DEFAULTS.whatsapp;
  const text = product
    ? [
        "Hola! Quiero consultar por este sillón de Sillones FB:",
        "",
        `Producto: ${product.nombre || "-"}`,
        `Código: ${buildProductCode(product, product.id || "")}`,
        `Categoría: ${product.categoria || "-"}`,
        `Precio: ${money(product.precio)}`,
        `Descripción: ${product.descripcion || "-"}`,
        `Link: ${buildProductUrl(product)}`
      ].join("\n")
    : "Hola! Quiero informacion sobre los sillones de Sillones FB.";
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

function showPreview(url, targetImage) {
  if (!url || !targetImage) return;
  targetImage.dataset.fallbackApplied = "false";
  targetImage.src = resolveImageUrl(url);
  targetImage.classList.remove("hidden");
}

function toggleHidden(element, shouldHide) {
  if (element) element.classList.toggle("hidden", shouldHide);
}

function playSuccessSound() {
  const AudioContextRef = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextRef) return;
  const context = new AudioContextRef();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
  oscillator.stop(context.currentTime + 0.3);
}

function createToast(message, type = "success") {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden", "error");
  if (type === "error") toast.classList.add("error");
  window.clearTimeout(createToast.timer);
  createToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2600);
}

function validateProduct(data) {
  if (!data.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  if (!data.descripcion?.trim()) throw new Error("La descripcion es obligatoria.");
  if (!data.categoria?.trim()) throw new Error("Selecciona una categoria.");
  if (Number(data.precio) <= 0) throw new Error("El precio debe ser mayor a 0.");
}

async function loadPublicPage() {
  const [home, settings, initialProducts] = await Promise.all([getHome(), getSettings(), getInitialProducts()]);
  let currentProducts = initialProducts.filter((product) => product.visible);
  let currentCategory = "Todos";
  attachImageFallback(qs("#banner-image"));
  setupLightbox();
  setupBackToCatalog();
  setupCatalogLinks();

  applyHome(home, settings);
  applySettings(settings);
  renderFilters();
  renderAllSections();

  listenVisibleProducts((products) => {
    currentProducts = products;
    renderAllSections();
  });

  function applyHome(data, currentSettings) {
    qs("#banner-text").textContent = data?.bannerTexto || DEFAULTS.bannerTexto;
    qs("#banner-button").textContent = data?.bannerBoton || DEFAULTS.bannerBoton;
    const bannerImage = qs("#banner-image");
    bannerImage.dataset.fallbackApplied = "false";
    bannerImage.src = resolveImageUrl(data?.bannerImagen || DEFAULTS.bannerImagen);
    qs("#banner-button").href = buildWhatsAppUrl(currentSettings?.whatsapp);
  }

  function applySettings(data) {
    const phone = data?.whatsapp || DEFAULTS.whatsapp;
    const buttonUrl = buildWhatsAppUrl(phone);
    applyTheme(data?.theme);
    qs("#floating-whatsapp").href = buttonUrl;
    qs("#contact-whatsapp-button").href = buttonUrl;
    qs("#contact-whatsapp-label").textContent = `+${phone}`;
    qs("#contact-address").textContent = data?.direccion || DEFAULTS.direccion;
    qs("#contact-hours").textContent = data?.horario || DEFAULTS.horario;
  }

  function renderFilters() {
    const wrap = qs("#catalog-filters");
    wrap.innerHTML = "";
    CATEGORIES.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-chip${category === currentCategory ? " active" : ""}`;
      button.textContent = category;
      button.addEventListener("click", () => {
        currentCategory = category;
        qsa(".filter-chip", wrap).forEach((chip) => chip.classList.remove("active"));
        button.classList.add("active");
        renderCatalog();
      });
      wrap.appendChild(button);
    });
  }

  function renderAllSections() {
    const offers = currentProducts.filter((product) => product.oferta);
    const featured = currentProducts.filter((product) => product.destacado);
    const isFiltered = currentCategory !== "Todos";

    toggleHidden(qs("#ofertas-section"), isFiltered || !offers.length);
    toggleHidden(qs("#featured-section"), isFiltered || !featured.length);

    renderProducts(qs("#offers-grid"), offers, settings);
    renderProducts(qs("#featured-grid"), featured, settings);
    renderCatalog();
  }

  function renderCatalog() {
    const filtered = currentCategory === "Todos" ? currentProducts : currentProducts.filter((product) => product.categoria === currentCategory);
    renderProducts(qs("#catalog-grid"), filtered, settings);
  }
}

function renderProducts(container, items, settings) {
  const template = qs("#product-card-template");
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "panel-card";
    empty.innerHTML = "<p class='muted'>Todavia no hay productos cargados en esta seccion.</p>";
    container.appendChild(empty);
    return;
  }

  items.forEach((product, index) => {
    const fragment = template.content.cloneNode(true);
    const card = qs(".product-card", fragment);
    const image = qs(".product-image", fragment);
    const badge = qs(".product-badge", fragment);
    const oldPrice = qs(".product-old-price", fragment);
    const button = qs(".product-whatsapp", fragment);
    card.style.animationDelay = `${index * 40}ms`;
    image.dataset.fallbackApplied = "false";
    attachImageFallback(image);
    image.src = resolveImageUrl(product.imagenUrl || DEFAULTS.bannerImagen);
    image.alt = product.nombre;
    image.dataset.fullsrc = resolveImageUrl(product.imagenUrl || DEFAULTS.bannerImagen);
    image.dataset.fullalt = product.nombre;
    qs(".product-category", fragment).textContent = product.categoria;
    qs(".product-name", fragment).textContent = product.nombre;
    qs(".product-description", fragment).textContent = product.descripcion;
    qs(".product-price", fragment).textContent = money(product.precio);

    if (product.precioAnterior) {
      oldPrice.textContent = money(product.precioAnterior);
      oldPrice.classList.remove("hidden");
    } else {
      oldPrice.classList.add("hidden");
    }

    if (product.oferta) {
      badge.textContent = "Oferta";
      badge.classList.remove("hidden");
    } else if (product.destacado) {
      badge.textContent = "Destacado";
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    card.id = `producto-${slugify(buildProductCode(product, product.id || ""))}`;
    button.href = buildWhatsAppUrl(settings?.whatsapp, product);
    container.appendChild(fragment);
  });
}

function setupLightbox() {
  const lightbox = qs("#lightbox");
  const lightboxImage = qs("#lightbox-image");
  const closeButton = qs("#lightbox-close");
  const bannerImage = qs("#banner-image");

  if (!lightbox || !lightboxImage || !closeButton) return;

  function openLightbox(src, alt) {
    lightboxImage.src = src;
    lightboxImage.alt = alt || "Imagen ampliada";
    lightbox.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.add("hidden");
    lightboxImage.src = "";
    document.body.style.overflow = "";
  }

  bannerImage?.classList.add("zoomable");
  bannerImage?.addEventListener("click", () => {
    openLightbox(resolveImageUrl(bannerImage.getAttribute("src")), bannerImage.alt);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const zoomable = target.closest(".zoomable");
    if (!zoomable || zoomable.id === "banner-image") return;
    const image = zoomable;
    openLightbox(image.dataset.fullsrc || image.getAttribute("src") || "", image.dataset.fullalt || image.getAttribute("alt") || "");
  });

  closeButton.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.classList.contains("hidden")) {
      closeLightbox();
    }
  });
}

async function loadAdminPage() {
  const loginView = qs("#login-view");
  const adminView = qs("#admin-view");
  const logoutButton = qs("#logout-button");
  const loginForm = qs("#login-form");
  const productForm = qs("#product-form");
  const homeForm = qs("#home-form");
  const settingsForm = qs("#settings-form");
  const productPreview = qs("#product-preview");
  const homePreview = qs("#home-banner-preview");
  const productImageUrlInput = qs("#product-image-url");
  const productImagePublicIdInput = qs("#product-image-public-id");
  const homeImageUrlInput = qs("#home-banner-image-url");
  const homeImagePublicIdInput = qs("#home-banner-image-public-id");
  const homeCurrentUrlInput = qs("#home-banner-current-url");
  const autoReplyInput = qs("#settings-auto-reply");
  const themeInput = qs("#settings-theme");
  const state = { products: [], draggingId: null };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, qs("#login-email").value.trim(), qs("#login-password").value);
    } catch (error) {
      createToast(error.message || "No se pudo iniciar sesion.", "error");
    }
  });

  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
  });

  qs("#reset-product").addEventListener("click", resetProductForm);
  qs("#product-upload-widget").addEventListener("click", async () => {
    try {
      const uploaded = await createUploadWidget(qs("#product-folder").value);
      productImageUrlInput.value = uploaded.secure_url;
      productImagePublicIdInput.value = uploaded.public_id;
      showPreview(uploaded.secure_url, productPreview);
      createToast("Imagen subida correctamente");
    } catch (error) {
      createToast(error.message || "Error al subir.", "error");
    }
  });

  qs("#home-upload-widget").addEventListener("click", async () => {
    try {
      const uploaded = await createUploadWidget(qs("#home-banner-folder").value);
      homeImageUrlInput.value = uploaded.secure_url;
      homeImagePublicIdInput.value = uploaded.public_id;
      homeCurrentUrlInput.value = uploaded.secure_url;
      showPreview(uploaded.secure_url, homePreview);
      createToast("Banner subido correctamente");
    } catch (error) {
      createToast(error.message || "Error al subir.", "error");
    }
  });

  qs("#home-use-local-banner").addEventListener("click", () => {
    homeImageUrlInput.value = LOCAL_BANNER;
    homeImagePublicIdInput.value = "";
    homeCurrentUrlInput.value = LOCAL_BANNER;
    showPreview(LOCAL_BANNER, homePreview);
    createToast("Se seleccionó el logo local del proyecto");
  });

  qs("#copy-auto-reply").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(autoReplyInput.value.trim() || DEFAULTS.autoReply);
      createToast("Respuesta automática copiada");
    } catch (error) {
      createToast("No se pudo copiar el texto.", "error");
    }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const existingId = qs("#product-id").value.trim();
      const currentProduct = state.products.find((item) => item.id === existingId);
      let imagePayload = {
        imagenUrl: productImageUrlInput.value.trim() || currentProduct?.imagenUrl || "",
        public_id: productImagePublicIdInput.value.trim() || currentProduct?.public_id || ""
      };

      const payload = {
        codigo: qs("#product-code").value.trim().toUpperCase(),
        nombre: qs("#product-name").value.trim(),
        precio: Number(qs("#product-price").value),
        precioAnterior: Number(qs("#product-old-price").value) || null,
        descripcion: qs("#product-description").value.trim(),
        categoria: qs("#product-category").value,
        destacado: qs("#product-featured").checked,
        oferta: qs("#product-offer").checked,
        visible: qs("#product-visible").checked,
        orden: currentProduct?.orden || state.products.length + 1
      };

      validateProduct(payload);
      if (!imagePayload.imagenUrl) throw new Error("Subí una imagen con Cloudinary antes de guardar.");

      const savedId = await saveProduct(existingId, { ...payload, ...imagePayload });
      if (!payload.codigo) {
        await saveProduct(savedId, { codigo: buildProductCode(payload, savedId) });
      }
      playSuccessSound();
      createToast("Guardado correctamente");
      resetProductForm();
    } catch (error) {
      createToast(error.message || "Error al guardar el producto.", "error");
    }
  });

  homeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const existingHome = await getHome();
      const bannerImagen = homeImageUrlInput.value.trim() || existingHome?.bannerImagen || DEFAULTS.bannerImagen;
      await saveHome({
        bannerTexto: qs("#home-banner-text").value.trim(),
        bannerBoton: qs("#home-banner-button").value.trim(),
        bannerImagen,
        bannerPublicId: homeImagePublicIdInput.value.trim() || existingHome?.bannerPublicId || ""
      });
      homeCurrentUrlInput.value = bannerImagen;
      playSuccessSound();
      createToast("Home guardado correctamente");
    } catch (error) {
      createToast(error.message || "Error al guardar el home.", "error");
    }
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveSettings({
        whatsapp: sanitizePhone(qs("#settings-whatsapp").value),
        direccion: qs("#settings-address").value.trim(),
        horario: qs("#settings-hours").value.trim(),
        theme: resolveTheme(themeInput.value),
        cloudinaryCloudName: qs("#settings-cloud-name").value.trim(),
        cloudinaryUploadPreset: qs("#settings-upload-preset").value.trim(),
        autoReply: autoReplyInput.value.trim()
      });
      applyTheme(themeInput.value);
      playSuccessSound();
      createToast("Ajustes guardados correctamente");
    } catch (error) {
      createToast(error.message || "Error al guardar ajustes.", "error");
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      toggleHidden(loginView, false);
      toggleHidden(adminView, true);
      toggleHidden(logoutButton, true);
      return;
    }

    const allowed = await isAdmin(user.uid);
    if (!allowed) {
      await signOut(auth);
      createToast("Tu usuario no tiene permisos de administrador.", "error");
      return;
    }

    toggleHidden(loginView, true);
    toggleHidden(adminView, false);
    toggleHidden(logoutButton, false);
    await hydrateAdmin();
  });

  async function hydrateAdmin() {
    const [home, settings] = await Promise.all([getHome(), getSettings()]);
    applyTheme(settings?.theme);
    qs("#home-banner-text").value = home?.bannerTexto || DEFAULTS.bannerTexto;
    qs("#home-banner-button").value = home?.bannerBoton || DEFAULTS.bannerBoton;
    const activeBanner = home?.bannerImagen || DEFAULTS.bannerImagen;
    homeImageUrlInput.value = activeBanner;
    homeCurrentUrlInput.value = activeBanner;
    if (home?.bannerImagen) {
      homeImagePublicIdInput.value = home.bannerPublicId || "";
      attachImageFallback(homePreview);
      showPreview(home.bannerImagen, homePreview);
    } else {
      attachImageFallback(homePreview);
      showPreview(DEFAULTS.bannerImagen, homePreview);
    }
    qs("#settings-whatsapp").value = settings?.whatsapp || DEFAULTS.whatsapp;
    qs("#settings-address").value = settings?.direccion || DEFAULTS.direccion;
    qs("#settings-hours").value = settings?.horario || DEFAULTS.horario;
    themeInput.value = resolveTheme(settings?.theme);
    qs("#settings-cloud-name").value = settings?.cloudinaryCloudName || "";
    qs("#settings-upload-preset").value = settings?.cloudinaryUploadPreset || "";
    autoReplyInput.value = settings?.autoReply || DEFAULTS.autoReply;

    listenAllProducts((products) => {
      state.products = products;
      renderAdminList(products);
      updateKpis(products);
    });
  }

  function resetProductForm() {
    productForm.reset();
    qs("#product-id").value = "";
    qs("#product-code").value = "";
    qs("#product-visible").checked = true;
    qs("#product-folder").value = "productos";
    productImageUrlInput.value = "";
    productImagePublicIdInput.value = "";
    productPreview.src = "";
    productPreview.classList.add("hidden");
  }

  function renderAdminList(products) {
    const list = qs("#admin-products-list");
    list.innerHTML = "";
    if (!products.length) {
      list.innerHTML = "<div class='admin-product-item'><p class='muted'>Todavia no hay productos cargados.</p></div>";
      return;
    }

    products.forEach((product) => {
      const item = document.createElement("article");
      item.className = "admin-product-item";
      item.draggable = true;
      item.dataset.id = product.id;
      item.innerHTML = `
        <div class="admin-product-head">
          <div>
            <strong>${product.nombre}</strong>
            <p class="muted">${buildProductCode(product, product.id)} · ${product.categoria} · ${money(product.precio)}</p>
          </div>
          <span class="mini-badge">Orden ${product.orden || "-"}</span>
        </div>
        <img src="${resolveImageUrl(product.imagenUrl || DEFAULTS.bannerImagen)}" alt="${product.nombre}">
        <div class="check-grid">
          <span class="mini-badge">${product.visible ? "Visible" : "Oculto"}</span>
          <span class="mini-badge">${product.destacado ? "Destacado" : "Normal"}</span>
          <span class="mini-badge">${product.oferta ? "Oferta" : "Sin oferta"}</span>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary js-edit" type="button">Editar</button>
          <button class="btn btn-danger js-delete" type="button">Eliminar</button>
        </div>
      `;

      item.addEventListener("dragstart", () => {
        state.draggingId = product.id;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        state.draggingId = null;
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (event) => event.preventDefault());
      item.addEventListener("drop", async (event) => {
        event.preventDefault();
        if (!state.draggingId || state.draggingId === product.id) return;
        const reordered = [...state.products];
        const from = reordered.findIndex((entry) => entry.id === state.draggingId);
        const to = reordered.findIndex((entry) => entry.id === product.id);
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        try {
          await reorderProducts(reordered);
          createToast("Orden actualizado");
        } catch (error) {
          createToast(error.message || "No se pudo ordenar.", "error");
        }
      });

      qs(".js-edit", item).addEventListener("click", () => fillProductForm(product));
      qs(".js-delete", item).addEventListener("click", async () => {
        if (!window.confirm(`Se eliminara "${product.nombre}". Deseas continuar?`)) return;
        const secret = window.prompt(`Para eliminar "${product.nombre}", escribi la clave secreta.`);
        if (secret !== DELETE_SECRET) {
          createToast("Clave incorrecta. No se eliminó el producto.", "error");
          return;
        }
        try {
          await removeProduct(product.id);
          createToast("Producto eliminado");
        } catch (error) {
          createToast(error.message || "No se pudo eliminar.", "error");
        }
      });
      list.appendChild(item);
    });
  }

  function fillProductForm(product) {
    qs("#product-id").value = product.id;
    qs("#product-code").value = product.codigo || buildProductCode(product, product.id);
    qs("#product-name").value = product.nombre || "";
    qs("#product-price").value = product.precio || "";
    qs("#product-old-price").value = product.precioAnterior || "";
    qs("#product-category").value = product.categoria || "Esquinero .. sillon L | doble";
    qs("#product-description").value = product.descripcion || "";
    qs("#product-featured").checked = Boolean(product.destacado);
    qs("#product-offer").checked = Boolean(product.oferta);
    qs("#product-visible").checked = product.visible !== false;
    productImageUrlInput.value = product.imagenUrl || "";
    productImagePublicIdInput.value = product.public_id || "";
    if (product.imagenUrl) {
      attachImageFallback(productPreview);
      showPreview(product.imagenUrl, productPreview);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateKpis(products) {
    qs("#kpi-visible").textContent = String(products.filter((item) => item.visible).length);
    qs("#kpi-offers").textContent = String(products.filter((item) => item.oferta).length);
    qs("#kpi-featured").textContent = String(products.filter((item) => item.destacado).length);
  }
}

const page = document.body.dataset.page;
if (page === "public") loadPublicPage().catch((error) => console.error(error));
if (page === "admin") loadAdminPage().catch((error) => console.error(error));
