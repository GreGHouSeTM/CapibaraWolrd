#!/usr/bin/env python3
"""Inspection rapide d'un .glb : extensions, nœuds, matériaux, poids des images et de la géométrie.
Usage : python3 tools/polyhaven/inspect_glb.py public/assets/models/props/wooden_bucket_01.glb [...]"""
import json
import struct
import sys

for path in sys.argv[1:]:
    data = open(path, 'rb').read()
    n = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + n])
    views = g.get('bufferViews', [])
    img_bytes = sum(views[i['bufferView']]['byteLength'] for i in g.get('images', []) if 'bufferView' in i)
    print(path, f'{len(data) / 1024:.0f} Ko', 'images', f'{img_bytes / 1024:.0f} Ko', 'géométrie', f'{(len(data) - img_bytes) / 1024:.0f} Ko')
    print('  extensions', g.get('extensionsUsed'))
    print('  nœuds', [x.get('name') for x in g.get('nodes', [])])
    for m in g.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        print('  matériau', m.get('name'), 'alpha', m.get('alphaMode', 'OPAQUE'), m.get('alphaCutoff'), 'double', m.get('doubleSided', False),
              'tex', [k for k in ('baseColorTexture', 'metallicRoughnessTexture') if k in pbr] + [k for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture') if k in m],
              'facteurs', pbr.get('baseColorFactor'), pbr.get('metallicFactor'), pbr.get('roughnessFactor'))
    for i in g.get('images', []):
        print('  image', i.get('name'), i.get('mimeType'), f"{views[i['bufferView']]['byteLength'] / 1024:.0f} Ko")
