import { getSettings } from "./firebase.js";

function normalizeFolder(folder) {
  return `sillones-fb/${folder || "productos"}`;
}

async function createUploadWidget(folder = "productos") {
  const settings = await getSettings();
  const cloudName = settings?.cloudinaryCloudName || "";
  const uploadPreset = settings?.cloudinaryUploadPreset || "sillonesfb_unsigned";

  if (!cloudName) {
    throw new Error("Configurá Cloudinary cloud name en Ajustes antes de subir imágenes.");
  }

  if (!window.cloudinary?.createUploadWidget) {
    throw new Error("El widget de Cloudinary no está disponible.");
  }

  return new Promise((resolve, reject) => {
    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName,
        uploadPreset,
        folder: normalizeFolder(folder),
        multiple: false,
        maxFiles: 1,
        sources: ["local", "camera", "url"],
        resourceType: "image",
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
        showAdvancedOptions: false,
        cropping: false
      },
      (error, result) => {
        if (error) {
          reject(new Error("Error al subir la imagen con Cloudinary."));
          return;
        }

        if (result?.event === "success") {
          resolve({
            secure_url: result.info.secure_url,
            public_id: result.info.public_id
          });
        }
      }
    );

    widget.open();
  });
}

export { createUploadWidget };
