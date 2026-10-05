const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "성물");
fs.mkdirSync(OUT, { recursive: true });

const SRC = {
  초월: "C:/Users/links/.cursor/projects/c-Users-links-Downloads/assets/c__Users_links_AppData_Roaming_Cursor_User_workspaceStorage_3b2fbb6e705ae097c0062898f455353a_images_image-0829d03f-60c4-4ca2-9da2-39d01eeaa84b.jpg",
  외형: "C:/Users/links/.cursor/projects/c-Users-links-Downloads/assets/c__Users_links_AppData_Roaming_Cursor_User_workspaceStorage_3b2fbb6e705ae097c0062898f455353a_images_image-156f5f39-6a08-4d0e-abf4-a91a396a3dc5.jpg",
  황금: "C:/Users/links/.cursor/projects/c-Users-links-Downloads/assets/c__Users_links_AppData_Roaming_Cursor_User_workspaceStorage_3b2fbb6e705ae097c0062898f455353a_images_image-56f40659-110f-4d4b-9448-6f199b75cd23.jpg",
  경험: "C:/Users/links/.cursor/projects/c-Users-links-Downloads/assets/c__Users_links_AppData_Roaming_Cursor_User_workspaceStorage_3b2fbb6e705ae097c0062898f455353a_images_image-f680bfac-4b9a-4e57-a0ff-1eb69714fee3.jpg",
};

async function run() {
  for (const [name, src] of Object.entries(SRC)) {
    const meta = await sharp(src).metadata();
    const w = meta.width;
    const h = meta.height;
    await sharp(src).jpeg({ quality: 90 }).toFile(path.join(OUT, name + ".jpg"));
    await sharp(src)
      .blur(28)
      .modulate({ brightness: 0.55, saturation: 0.7 })
      .jpeg({ quality: 82 })
      .toFile(path.join(OUT, name + "-bg.jpg"));
    const art = {
      left: Math.round(w * 0.305),
      top: Math.round(h * 0.245),
      width: Math.round(w * 0.39),
      height: Math.round(h * 0.415),
    };
    await sharp(src)
      .extract(art)
      .png()
      .toFile(path.join(OUT, name + "-art.png"));
    console.log(name, w + "x" + h, "art", art);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
