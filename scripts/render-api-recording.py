#!/usr/bin/env python3
"""Render the genuine asciicast recording as a readable silent review video."""
import json,subprocess
from pathlib import Path
import pyte
from PIL import Image,ImageDraw,ImageFont

root=Path(__file__).resolve().parents[1]
lines=(root/'evidence/protocol-live-api.cast').read_text().splitlines()
header=json.loads(lines[0]);events=[json.loads(line) for line in lines[1:]]
assert events[-1][2].endswith('End of walkthrough.'), 'Wait for the live recording to finish before rendering.'
screen=pyte.Screen(header['width'],header['height']);stream=pyte.Stream(screen)
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',27)
width,height,fps=1920,1080,10
out=root/'evidence/protocol-live-api-walkthrough.mp4'
process=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{width}x{height}','-framerate',str(fps),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
event=0
for frame in range(int((events[-1][0]+2)*fps)):
 now=frame/fps
 while event<len(events) and events[event][0]<=now:
  if events[event][1]=='o':stream.feed(events[event][2])
  event+=1
 image=Image.new('RGB',(width,height),(19,22,27));draw=ImageDraw.Draw(image)
 for row,text in enumerate(screen.display):
  draw.text((40,30+row*32),text,font=font,fill=(235,238,242))
 process.stdin.write(image.tobytes())
process.stdin.close();code=process.wait()
if code:raise SystemExit(code)
print(out)
