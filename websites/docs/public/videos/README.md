It takes effort to produce the videos, but the overall approach is to record them from the screen and then process
with ffmpeg to remove parts, add border, and speed up and prepare webm versions.

```sh
ffmpeg -i input.mp4 -an -vf "select='not(between(t,2,5))',setpts=N/FRAME_RATE/TB,pad=width=iw+20:height=ih+20:x=10:y=10:color=1d2120,setpts=PTS/1.5" result.mp4
                             ⎩_________________________________________________⎭ ⎩_________________________________________________⎭ ⎩____________⎭
                                        REMOVE PART BETWEEN 2-5 SECS                             ADD 10PX GRAY BORDER                   SPEED UP
```

Once completed, generate WebM versions:

```sh
for file in *.mp4
    ffmpeg -i $file -c:v libvpx-vp9 -crf 30 -b:v 0 -an (basename $file .mp4).webm
end
```
