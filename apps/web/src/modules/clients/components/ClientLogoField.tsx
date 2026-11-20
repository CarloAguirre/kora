import { useState } from 'react';
import { CLIENT_LOGO_MAX_LENGTH } from '@kora/contracts';
import { FileField } from '@/shared/components/ui/FileField';
import { Button } from '@/shared/components/ui/Button';
import { BuildingIcon, TrashIcon } from '@/shared/components/icons/Icons';
import styles from './ClientLogoField.module.css';

/**
 * Lado máximo del logo guardado. El portal lo muestra a 56 px de alto y hasta
 * 200 px de ancho; 512 cubre eso en pantallas de alta densidad.
 */
const LOGO_MAX_SIDE = 512;
/** Tope al leer el original, para no recorrer millones de píxeles al recortar márgenes. */
const SOURCE_MAX_SIDE = 2048;

export interface ClientLogoFieldProps {
  /** Logo actual como data URL, o `null` si el cliente no tiene. */
  value: string | null;
  onChange: (value: string | null) => void;
  errorText?: string;
  disabled?: boolean;
}

/**
 * Carga del logo del cliente.
 *
 * La imagen no viaja tal cual: se le recortan los márgenes vacíos (blancos o
 * transparentes, muy comunes en los archivos de logo y que lo achican en
 * pantalla), se reduce a `LOGO_MAX_SIDE` y se re-codifica como PNG (WebP si el
 * PNG queda pesado). Así lo que se guarda es siempre un raster chico y limpio,
 * sea cual sea el archivo original — incluido un SVG, que queda rasterizado.
 */
export function ClientLogoField({ value, onChange, errorText, disabled }: ClientLogoFieldProps) {
  // El nombre se guarda junto al logo que produjo: si el valor cambia desde
  // fuera (el modal se reabre con otro cliente o con lo que quedó en base), el
  // nombre ya no corresponde y no se muestra.
  const [picked, setPicked] = useState<{ name: string | null; value: string } | null>(null);
  const fileName = picked && picked.value === value ? picked.name : null;
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFile = async (name: string | null, file: File | null) => {
    if (!file) return;
    setLocalError(null);
    setProcessing(true);
    try {
      const dataUrl = await toLogoDataUrl(file);
      setPicked({ name, value: dataUrl });
      onChange(dataUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo leer la imagen.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    setPicked(null);
    setLocalError(null);
    onChange(null);
  };

  const message = localError ?? errorText;

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        {value ? (
          <img className={styles.logo} src={value} alt="Logo del cliente" />
        ) : (
          <div className={styles.preview}>
            <BuildingIcon size={28} aria-hidden="true" />
          </div>
        )}
        <div className={styles.picker}>
          <FileField
            label="Logo"
            fileName={fileName ?? (value ? 'Logo cargado' : null)}
            onChange={(name, file) => void handleFile(name, file)}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={disabled || processing}
          />
        </div>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.remove}
            iconLeft={<TrashIcon size={14} />}
            onClick={handleRemove}
            disabled={disabled || processing}
          >
            Quitar
          </Button>
        )}
      </div>
      {message ? (
        <span className={styles.error} role="alert">
          {message}
        </span>
      ) : (
        <span className={styles.hint}>PNG, JPG, WebP o SVG. Se muestra en la vista cliente.</span>
      )}
    </div>
  );
}

async function toLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');

  const image = await loadImage(file);
  // Un SVG sin dimensiones intrínsecas reporta 0: se dibuja a un tamaño razonable.
  const naturalWidth = image.naturalWidth || LOGO_MAX_SIDE;
  const naturalHeight = image.naturalHeight || LOGO_MAX_SIDE;
  const sourceScale = Math.min(1, SOURCE_MAX_SIDE / Math.max(naturalWidth, naturalHeight));

  const source = drawToCanvas(
    image,
    Math.max(1, Math.round(naturalWidth * sourceScale)),
    Math.max(1, Math.round(naturalHeight * sourceScale)),
  );
  const bounds = contentBounds(source);

  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bounds.width, bounds.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo procesar la imagen.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const png = canvas.toDataURL('image/png');
  if (png.length <= CLIENT_LOGO_MAX_LENGTH) return png;
  const webp = canvas.toDataURL('image/webp', 0.85);
  if (webp.startsWith('data:image/webp') && webp.length <= CLIENT_LOGO_MAX_LENGTH) return webp;
  throw new Error('El logo es demasiado pesado. Prueba con una imagen más simple.');
}

function drawToCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo procesar la imagen.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Caja que encierra el contenido del logo, ignorando los bordes transparentes
 * o casi blancos. Si la imagen es entera de ese color (o no se puede leer),
 * devuelve la imagen completa.
 */
function contentBounds(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } {
  const full = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const context = canvas.getContext('2d');
  if (!context) return full;

  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isEmpty = data[i + 3]! < 16 || (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240);
      if (isEmpty) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return full;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    image.src = url;
  });
}
