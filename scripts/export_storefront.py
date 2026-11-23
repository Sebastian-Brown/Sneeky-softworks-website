"""Export the Storefront scene for the website. Run inside Blender."""

from array import array
from pathlib import Path
import json
import re
import struct
import sys
from tempfile import TemporaryDirectory

import bpy


def optimize_web_assets(scene):
    # Preserve more detail on readable artwork. Normal and scalar maps need
    # less resolution at the website camera's distance.
    for image in list(bpy.data.images):
        if image.source not in {"FILE", "GENERATED"} or not image.users:
            continue
        width, height = image.size
        largest = max(width, height)
        is_art = re.search(r"sign|calligraphy|logo|noren|billboard|graphics", image.name, re.I)
        limit = 1024 if is_art else 768 if image.colorspace_settings.name == "sRGB" else 512
        if largest > limit:
            image.scale(max(1, round(width * limit / largest)), max(1, round(height * limit / largest)))
        if image.name.startswith("marble_bust_01_mask") and not image.library:
            # Blender's WebP writer rejects this original single-channel mask.
            width, height = image.size
            pixels = array("f", [0]) * (width * height * 4)
            image.pixels.foreach_get(pixels)
            rgba = bpy.data.images.new(image.name + " RGB", width, height, alpha=False)
            rgba.colorspace_settings.name = image.colorspace_settings.name
            rgba.pixels.foreach_set(pixels)
            image.user_remap(rgba)

    for obj in scene.objects:
        if obj.type != "MESH" or obj.library or not obj.visible_get():
            continue
        if obj.data.shape_keys or any(mod.type == "ARMATURE" for mod in obj.modifiers):
            continue
        polygons = len(obj.data.polygons)
        if polygons > 9000 and not re.search(r"sign|artwork|cherry blossom", obj.name, re.I):
            simplify = obj.modifiers.new("Web geometry reduction", "DECIMATE")
            simplify.ratio = max(0.24, min(0.65, 6500 / polygons))


def verify_textures(path):
    with path.open("rb") as model:
        _, _, _, length, _ = struct.unpack("<4sIIII", model.read(20))
        document = json.loads(model.read(length))
    images = document.get("images", [])
    for index, texture in enumerate(document.get("textures", [])):
        webp = texture.get("extensions", {}).get("EXT_texture_webp", {})
        source = webp.get("source", texture.get("source"))
        if not isinstance(source, int) or not 0 <= source < len(images):
            raise RuntimeError(f"GLB texture {index} has no usable image source")


def main():
    scene = bpy.data.scenes.get("Storefront")
    if scene is None:
        raise RuntimeError("The Blender file has no scene named Storefront.")
    bpy.context.window.scene = scene
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    project = Path(__file__).resolve().parents[1]
    destination = project / "public" / "assets" / "models" / "ramen-shop.glb"
    if "--" in sys.argv:
        destination = Path(sys.argv[sys.argv.index("--") + 1]).resolve()

    # Keep the existing frame-zero placement for construction meshes. Only
    # the active cat and fox actions are intended to play on the website.
    scene.frame_set(0)
    # The desktop view layer hides the mobile cameras. Export independent
    # cameras at their evaluated poses without making hidden props visible.
    for name, export_name, portrait in [
        ("Storefront Cameras | Mobile Camera - 9x19.5", "Web Mobile Portrait Camera", True),
        ("Storefront Cameras | Mobile Camera-16x9", "Web Mobile Landscape Camera", False),
    ]:
        source = scene.objects.get(name)
        if source is None or source.type != "CAMERA":
            continue
        camera = bpy.data.objects.new(export_name, source.data.copy())
        scene.collection.objects.link(camera)
        camera.matrix_world = source.matrix_world.copy()
        if portrait and camera.data.type == "PERSP" and camera.data.sensor_fit == "AUTO":
            angle = camera.data.angle
            camera.data.sensor_fit = "VERTICAL"
            camera.data.angle = angle

    for obj in scene.objects:
        animation = obj.animation_data
        if animation and animation.action and obj.name not in {"cat", "fox"}:
            rest_transform = obj.matrix_basis.copy()
            animation.action = None
            obj.matrix_basis = rest_transform

    billboard = bpy.data.materials.get("Emission | Billboard video screen")
    if billboard and billboard.node_tree:
        tree = billboard.node_tree
        still = tree.nodes.get("Billboard Web Still")
        if still:
            emission = next(node for node in tree.nodes if node.type == "EMISSION")
            tree.links.new(still.outputs["Color"], emission.inputs["Color"])

    optimize_web_assets(scene)

    # Stage outside public so Vite never serves the model while it is being written.
    with TemporaryDirectory(dir=Path(bpy.data.filepath).parent) as temporary:
        candidate = Path(temporary) / destination.name
        result = bpy.ops.export_scene.gltf(
            filepath=str(candidate),
            export_format="GLB",
            use_active_scene=True,
            use_visible=True,
            export_cameras=True,
            export_lights=True,
            export_image_format="WEBP",
            export_image_quality=82,
            export_meshopt_compression_enable=True,
            export_apply=True,
            export_animations=True,
            export_animation_mode="ACTIVE_ACTIONS",
            export_nla_strips_merged_animation_name="Storefront Pet Idle",
        )
        if result != {"FINISHED"} or not candidate.is_file():
            raise RuntimeError("Blender did not finish exporting the storefront.")
        verify_textures(candidate)
        candidate.replace(destination)


main()
