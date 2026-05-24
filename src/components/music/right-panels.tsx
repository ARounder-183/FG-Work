"use client";

import { apiUrl } from "@/lib/url";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Song {
  id: number; name: string; artists: string; album: string; duration: number; picUrl?: string;
}
interface MySong { id: string; songData: string; sortOrder: number; }
interface PlaylistResult { id: number; name: string; coverImgUrl?: string; trackCount?: number; }

function fmt(s: number) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; }

interface Props {
  mySongs: MySong[];
  currentSong: Song | null;
  onReorder: (s: {id:string;sortOrder:number}[]) => void;
  onClear: () => void;
  onRandomize: () => void;
  onAddSong: (s:Song) => void;
  onAddSongs: (s:Song[]) => void;
}

export function RightPanels({ mySongs, currentSong, onReorder, onClear, onRandomize, onAddSong, onAddSongs }: Props) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [myOpen, setMyOpen] = useState(true);
  const [tab, setTab] = useState("song");
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const search = async (append = false) => {
    if (!query.trim()) return;
    setSearching(true);
    const type = tab === "song" ? "song" : "playlist";
    const offset = append ? nextOffset : 0;
    const r = await fetch(apiUrl(`/api/music/search?q=${encodeURIComponent(query.trim())}&type=${type}&offset=${offset}`));
    const d = await r.json();
    if (tab === "song") {
      setSongs(append ? [...songs, ...(d.songs || [])] : (d.songs || []));
      setPlaylists([]);
    } else {
      setPlaylists(append ? [...playlists, ...(d.playlists || [])] : (d.playlists || []));
      setSongs([]);
    }
    setHasMore(d.hasMore || false);
    setNextOffset(d.nextOffset || 0);
    setSearching(false);
  };
  const loadPlaylist = async (id: number) => {
    const r = await fetch(apiUrl(`/api/music/playlist?id=${id}`));
    const d = await r.json();
    if (d.playlist?.tracks) { setSongs(d.playlist.tracks); setTab("song"); toast.success(`已加载：${d.playlist.name}`); }
    else toast.error("加载失败");
  };

  return (
    <>
      {/* Search panel (left of the two) */}
      {searchOpen && (
        <div className="flex w-60 shrink-0 flex-col border-l bg-background">
          <div className="flex items-center justify-between border-b px-2.5 py-2">
            <span className="text-xs font-semibold">添加歌曲</span>
            <button onClick={() => setSearchOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <div className="flex gap-1 border-b px-1.5 py-1">
            <Input placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} className="h-6 text-[10px]" />
              <Button size="sm" className="h-6 text-[10px]" onClick={() => search()} disabled={searching}>{searching?"..":"搜索"}</Button>
          </div>
          <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-1.5 mt-1 grid w-auto grid-cols-2">
              <TabsTrigger value="song" className="text-[10px] h-6">单曲</TabsTrigger>
              <TabsTrigger value="playlist" className="text-[10px] h-6">歌单</TabsTrigger>
            </TabsList>
            <TabsContent value="song" className="flex-1 overflow-y-auto">
              {songs.length>0 && (
                <div className="border-b px-1.5 py-1">
                  <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={()=>{onAddSongs(songs);toast.success(`已添加 ${songs.length} 首`)}}>全部添加 ({songs.length})</Button>
                </div>
              )}
              <div className="divide-y">
                {songs.map((s,i)=>(
                  <div key={s.id||i} className="flex items-center gap-1 px-1.5 py-1 text-[11px] hover:bg-accent">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{s.name}</div>
                      <div className="truncate text-muted-foreground/70">{s.artists}</div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-[10px]" onClick={()=>onAddSong(s)}>+</Button>
                  </div>
                ))}
              </div>
              {hasMore && (
                <div className="border-b px-1.5 py-1">
                  <Button variant="ghost" size="sm" className="w-full text-[10px]" onClick={() => search(true)}>加载更多</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="playlist" className="flex-1 overflow-y-auto divide-y">
              {playlists.map(p=>(
                <div key={p.id} className="flex cursor-pointer items-center gap-1.5 px-1.5 py-1.5 hover:bg-accent" onClick={()=>loadPlaylist(p.id)}>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs">🎵</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.trackCount||"?"} 首</div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <div className="border-b px-1.5 py-1">
                  <Button variant="ghost" size="sm" className="w-full text-[10px]" onClick={() => search(true)}>加载更多</Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* My playlist panel (right of search) */}
      {myOpen && (
        <div className="flex w-60 shrink-0 flex-col border-l bg-background">
          <div className="flex items-center justify-between border-b px-2.5 py-2">
            <span className="text-xs font-semibold">我的歌单 ({mySongs.length})</span>
            <button onClick={() => setMyOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <div className="flex gap-1 border-b px-1.5 py-1">
            <Button variant="ghost" size="sm" className="h-6 flex-1 text-[10px]" onClick={onRandomize} disabled={mySongs.length===0}>随机</Button>
            <Button variant="ghost" size="sm" className="h-6 flex-1 text-[10px] text-destructive" onClick={onClear} disabled={mySongs.length===0}>清空</Button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {mySongs.length === 0 ? (
              <p className="p-3 text-center text-[11px] text-muted-foreground">从搜索添加歌曲</p>
            ) : mySongs.map((item, i) => {
              const s = JSON.parse(item.songData) as Song;
              const isCur = currentSong && s.id === currentSong.id;
              return (
                <div key={item.id} draggable onDragStart={e=>{e.dataTransfer.setData("idx",String(i))}} onDragOver={e=>e.preventDefault()} onDrop={e=>{
                  e.preventDefault(); const from=Number(e.dataTransfer.getData("idx")); if(from===i)return;
                  const u=[...mySongs]; const [m]=u.splice(from,1); u.splice(i,0,m); onReorder(u.map((x,j)=>({id:x.id,sortOrder:j})));
                }} className={`flex cursor-grab items-center gap-1 px-2 py-1 text-[11px] active:cursor-grabbing ${isCur?"bg-primary/10":"hover:bg-accent"}`}>
                  <span className="w-4 text-center tabular-nums text-muted-foreground">{String(i+1).padStart(2,"0")}</span>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {s.picUrl ? <img src={s.picUrl} alt="" className="h-full w-full object-cover"/> : <span className="text-[7px]">🎵</span>}
                  </div>
                  <div className="min-w-0 flex-1"><div className={`truncate ${isCur?"font-medium text-primary":""}`}>{s.name}</div></div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(s.duration)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle icon bar - always visible at rightmost edge */}
      <div className="flex w-8 shrink-0 flex-col gap-1 border-l bg-background/50 p-1">
        {!searchOpen && (
          <button onClick={() => setSearchOpen(true)} className="flex h-8 w-8 items-center justify-center rounded text-xs hover:bg-accent" title="添加歌曲">🔍</button>
        )}
        {!myOpen && (
          <button onClick={() => setMyOpen(true)} className="flex h-8 w-8 items-center justify-center rounded text-xs hover:bg-accent" title="我的歌单">📋</button>
        )}
      </div>
    </>
  );
}
