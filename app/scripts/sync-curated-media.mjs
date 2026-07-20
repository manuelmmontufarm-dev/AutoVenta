import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../site/assets/catalog");

const assets = [
  ["falken-azenis-fk520l.jpg", "https://dzpdbgwih7u1r.cloudfront.net/96a712f6-c947-4b36-92cc-d2c605db4529/9f7ec332-4580-46b7-91cc-e89d2be3b2ad/9f7ec444-c195-4bcf-81cc-0e13828c1fc8/w1721h2400-FK520-01%20High%20Res.jpg"],
  ["falken-wildpeak-at4w.png", "https://dzpdbgwih7u1r.cloudfront.net/96a712f6-c947-4b36-92cc-d2c605db4529/9f686b78-4f33-4dc9-b0e4-7925636b3ce5/9f686b78-4f4a-41ff-adb6-08bb6e8efa05/w1799h2400-4x4-LT_7.png"],
  ["falken-wildpeak-at-trail.png", "https://dzpdbgwih7u1r.cloudfront.net/96a712f6-c947-4b36-92cc-d2c605db4529/9f7e6652-9970-46a2-bb62-6cbc115ba3d7/9f7e6a01-6868-4db2-b769-d2f4b1a2e788/w271h400-Falken%20Wildpeak%20AT%20Trail.png"],
  ["falken-wildpeak-at3w.jpg", "https://dzpdbgwih7u1r.cloudfront.net/96a712f6-c947-4b36-92cc-d2c605db4529/9f7e7b66-40c5-4976-9973-24714a7b2ef0/9f7e7ba3-42eb-4b89-9910-c47e1bb9e8b1/w1200h1200-Wildpeak%20AT3W%203%20Quarter.jpg"],
  ["falken-ze914er.jpg", "https://www.falkentyre.com/__image/a/138437/alias/xl/v/4/c/32/ar/1-1/fn/Falken_ZIEX-ZE914-Ecorun_30Grad.jpg"],
  ["falken-ziex-ct60as.png", "https://dzpdbgwih7u1r.cloudfront.net/96a712f6-c947-4b36-92cc-d2c605db4529/9f78f5d7-891e-4c5f-a9c1-efb5be313edd/9f78f8f4-a60c-4b95-85ea-939a16d3a3ad/w271h400-457x673_CT60_Three_quarter_0.png"],
  ["falken-azenis-rt615k-plus.png", "https://cdn.shopify.com/s/files/1/0515/0851/0900/files/Tire-Azenis-RT615Kplus-front-with-shadow-min_73662078-43b1-4e2c-bbe6-db13b155db71.png?v=1718308339"],
  ["kenda-kr100.png", "https://automotive.kendatire.com/media/737817/kr100_product-page.png"],
  ["kenda-kr15.jpg", "https://automotive.kendatire.com/media/466055/kr15_klever_hp.jpg"],
  ["kenda-kr23.jpg", "https://automotive.kendatire.com/media/1738/kr23.jpg"],
  ["kenda-kr26.jpg", "https://automotive.kendatire.com/media/2485/kr26_angle.jpg"],
  ["kenda-kr28.jpg", "https://automotive.kendatire.com/media/1031565/3-18-%E5%96%AE%E9%A1%86_kr28.jpg"],
  ["kenda-kr29.jpg", "https://i5.walmartimages.com/seo/Kenda-Klever-MT-KR29-Mud-Terrain-LT275-65R20-126-123Q-E-Light-Truck-Tire_2ecd737b-9041-4088-aa26-b281622529ba.ac3629bc03a22c113078ab1be78ab211.jpeg"],
  ["kenda-kr32.jpg", "https://automotive.kendatire.com/media/2487/kr32_angle.jpg"],
  ["kenda-kr33.jpg", "https://automotive.kendatire.com/media/2474/kr33_angle.jpg"],
  ["kenda-kr50.png", "https://automotive.kendatire.com/media/737823/kr50-45.png"],
  ["kenda-kr605.jpg", "https://automotive.kendatire.com/media/736934/kr605_1240x1500px_1.jpg"],
  ["kenda-kr628.png", "https://automotive.kendatire.com/media/737615/kr628_kenda_klever_at2_45degree_wide_web.png"],
  ["kenda-kr629.png", "https://automotive.kendatire.com/media/737636/kr629_kenda_klever_mt2_blk_ltr_45degree_wide_web.png"],
  ["winrun-maxclaw-at.jpg", "https://www.tempetyres.com.au/content/tyreproducts/ty-20250529-103048-99371.jpg"],
  ["winrun-maxclaw-ht2.jpg", "https://www.tempetyres.com.au/content/tyreproducts/ty_72954016.jpg"],
  ["winrun-maxclaw-rt.jpg", "https://www.tempetyres.com.au/content/tyreproducts/ty-20260226-123144-48479.jpg"],
  ["winrun-mt305.jpg", "https://www.tempetyres.com.au/content/tyreproducts/ty_83232828.jpg"],
  ["winrun-r330-e.jpg", "https://storage.googleapis.com/tireclick/llantas/WINRUNR330E_1.jpg"],
  ["winrun-r380.jpg", "https://www.tempetyres.com.au/content/tyreproducts/ty_22864879.jpg"],
];

await mkdir(target, { recursive: true });
for (const [filename, url] of assets) {
  const response = await fetch(url, {
    headers: { "User-Agent": "AutoVenta catalog media sync" },
  });
  if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) throw new Error(`${filename}: archivo demasiado pequeño`);
  await writeFile(resolve(target, filename), bytes);
  console.log(`${filename}: ${Math.round(bytes.length / 1024)} KB`);
}
