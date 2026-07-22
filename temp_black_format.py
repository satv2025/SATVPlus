import os
import shutil
import subprocess
import sys

INPUT = r"F:\Juegos Torrent\SISU221080 ZonaLeRos\SISU221080\SISU221080.mkv"
OUTPUT = r"F:\Juegos Torrent\SISU221080 ZonaLeRos\SISU221080\SISU221080_VR.mkv"

if not os.path.isfile(INPUT):
    sys.exit(f"No se encontró el video:\n{INPUT}")

if not shutil.which("ffmpeg"):
    sys.exit("No se encontró FFmpeg en el PATH.")

# Reduce el video a media pantalla y lo duplica:
# ojo izquierdo | ojo derecho
filtro_vr = (
    "[0:v:0]"
    "scale=trunc(iw/4)*2:trunc(ih/2)*2,"
    "split=2[izquierdo][derecho];"
    "[izquierdo][derecho]"
    "hstack=inputs=2[vr]"
)

comando = [
    "ffmpeg",
    "-hide_banner",
    "-y",
    "-i", INPUT,

    "-filter_complex", filtro_vr,

    "-map", "[vr]",
    "-map", "0:a?",
    "-map", "0:s?",

    # RTX 3050
    "-c:v", "h264_nvenc",
    "-preset", "p5",
    "-rc", "vbr",
    "-cq", "18",
    "-b:v", "0",
    "-pix_fmt", "yuv420p",

    # Conserva audios y subtítulos
    "-c:a", "copy",
    "-c:s", "copy",

    "-map_metadata", "0",
    "-map_chapters", "0",

    # Marca el archivo como izquierda/derecha
    "-metadata:s:v:0", "stereo_mode=left_right",

    OUTPUT
]

print("Generando versión VR...")
subprocess.run(comando, check=True)

print("\nTERMINADO")
print(f"Archivo creado:\n{OUTPUT}")
input("\nPresioná Enter para cerrar...")