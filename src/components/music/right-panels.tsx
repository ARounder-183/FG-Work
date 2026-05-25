"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Song {
  id: number | string;
  name: string;
  artists: string;
  album: string;
  duration: number;
  picUrl?: string;
  source?: "ncm" | "bilibili";
  bvid?: string;
  cid?: number;
}
interface MySong { id: string; songData: string; sortOrder: number; }
interface PlaylistResult { id: number; name: string; coverImgUrl?: string; trackCount?: number; creator?: { nickname: string }; }
interface DjRadio { id: number; name: string; coverUrl?: string; programCount?: number; dj?: { nickname: string }; }

function fmt(s: number) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; }

interface Props {
  mySongs: MySong[];
  currentSong: Song | null;
  onReorder: (s: {id:string;sortOrder:number}[]) => void;
  onClear: () => void;
  onRandomize: () => void;
  onDelete: (id: string) => void;
  onAddSong: (s:Song) => void;
  onAddSongs: (s:Song[]) => void;
  biliLoggedIn?: boolean;
  biliUname?: string;
  onBiliLogin?: () => void;
}

export function RightPanels({ mySongs, currentSong, onReorder, onClear, onRandomize, onDelete, onAddSong, onAddSongs, biliLoggedIn, biliUname, onBiliLogin }: Props) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [myOpen, setMyOpen] = useState(true);
  const [source, setSource] = useState<"ncm" | "bilibili">("ncm");
  const [tab, setTab] = useState("song");
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistResult[]>([]);
  const [djRadios, setDjRadios] = useState<DjRadio[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  // Bilibili favorites
  const [favFolders, setFavFolders] = useState<Array<{ id: number; fid: number; title: string; mediaCount: number }>>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favLoadingId, setFavLoadingId] = useState<number | null>(null);

  const search = async (append = false) => {
    if (!query.trim()) return;
    setSearching(true);
    const type = tab;
    const offset = append ? nextOffset : 0;
    const r = await fetch(apiUrl(`/api/music/search?q=${encodeURIComponent(query.trim())}&type=${type}&source=${source}&offset=${offset}`));
    const d = await r.json();

    const resultKey = tab === "song" || tab === "video" ? "songs" : tab === "dj" ? "djRadios" : "playlists";
    const current = tab === "song" || tab === "video" ? songs : tab === "dj" ? djRadios : playlists;
    const setFn = tab === "song" || tab === "video" ? setSongs : tab === "dj" ? setDjRadios : setPlaylists;

    setFn(append ? [...current, ...(d[resultKey] || [])] : (d[resultKey] || []));
    // Clear other tab results
    if (tab === "song" || tab === "video") { setPlaylists([]); setDjRadios([]); }
    else if (tab === "dj") { setSongs([]); setPlaylists([]); }
    else { setSongs([]); setDjRadios([]); }
    setHasMore(d.hasMore || false);
    setNextOffset(d.nextOffset || 0);
    setSearching(false);
  };

  // Reset pagination when switching tabs
  const handleTabChange = (val: string) => {
    setTab(val);
    setHasMore(false);
    setNextOffset(0);
    // Auto-load favorites when switching to fav tab
    if (val === "fav" && biliLoggedIn) fetchFavorites();
  };

  // Fetch Bilibili favorites list
  const fetchFavorites = async () => {
    setFavLoading(true);
    try {
      const r = await fetch(apiUrl("/api/bilibili/fav/list"));
      const d = await r.json();
      if (d.folders) setFavFolders(d.folders);
    } catch { /* silent */ }
    setFavLoading(false);
  };

  // Load favorites folder contents as songs
  const loadFavFolder = async (mediaId: number) => {
    setFavLoadingId(mediaId);
    try {
      const r = await fetch(apiUrl(`/api/bilibili/fav/detail?media_id=${mediaId}`));
      const d = await r.json();
      if (d.songs?.length) {
        setSongs(d.songs);
        setTab("video");
        toast.success(`已加载收藏夹 (${d.songs.length} 首)`);
        // Clear favorites display
        setFavFolders([]);
      } else {
        toast.error("加载失败");
      }
    } catch {
      toast.error("加载失败");
    }
    setFavLoadingId(null);
  };

  // Switch source — reset everything
  const handleSourceChange = (s: "ncm" | "bilibili") => {
    setSource(s);
    setSongs([]);
    setPlaylists([]);
    setDjRadios([]);
    setFavFolders([]);
    setHasMore(false);
    setNextOffset(0);
    setTab(s === "bilibili" ? "video" : "song");
    if (s === "bilibili" && biliLoggedIn) fetchFavorites();
  };

  const loadPlaylist = async (id: number) => {
    const r = await fetch(apiUrl(`/api/music/playlist?id=${id}`));
    const d = await r.json();
    if (d.playlist?.tracks) { setSongs(d.playlist.tracks); setTab("song"); toast.success(`已加载：${d.playlist.name}`); }
    else toast.error("加载失败");
  };

  const loadDjRadio = async (id: number) => {
    const r = await fetch(apiUrl(`/api/music/dj?id=${id}`));
    const d = await r.json();
    if (d.songs?.length) { setSongs(d.songs); setTab("song"); toast.success(`已加载电台节目`); }
    else toast.error("加载失败");
  };

  return (
    <>
      {/* Search panel (left of the two) */}
      {searchOpen && (
        <div className="flex w-60 shrink-0 flex-col border-l bg-background max-h-[calc(100vh-3.5rem)] overflow-hidden">
          <div className="flex items-center justify-between border-b px-2.5 py-2">
            <span className="text-xs font-semibold">添加歌曲</span>
            <button onClick={() => setSearchOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>

          {/* Source toggle */}
          <div className="flex border-b">
            <button
              onClick={() => handleSourceChange("ncm")}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                source === "ncm"
                  ? "border-b-2 border-primary text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >🎵 网易云</button>
            <button
              onClick={() => handleSourceChange("bilibili")}
              className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                source === "bilibili"
                  ? "border-b-2 border-primary text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >📺 Bilibili</button>
          </div>

          <div className="flex gap-1 border-b px-1.5 py-1">
            <Input placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} className="h-6 text-[10px]" />
              <Button size="sm" className="h-6 text-[10px]" onClick={() => search()} disabled={searching}>{searching?"..":"搜索"}</Button>
          </div>

          {source === "ncm" ? (
            <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-1.5 mt-1 grid w-auto grid-cols-3">
                <TabsTrigger value="song" className="text-[10px] h-6">单曲</TabsTrigger>
                <TabsTrigger value="playlist" className="text-[10px] h-6">歌单</TabsTrigger>
                <TabsTrigger value="dj" className="text-[10px] h-6">播客</TabsTrigger>
              </TabsList>
              <TabsContent value="song" className="flex-1 overflow-y-auto">
                {songs.length>0 && (
                  <div className="border-b px-1.5 py-1">
                    <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={()=>{onAddSongs(songs);toast.success(`已添加 ${songs.length} 首`)}}>全部添加 ({songs.length})</Button>
                  </div>
                )}
                <div className="divide-y">
                  {songs.map((s,i)=>(
                    <div key={String(s.id)||i} className="flex items-center gap-1 px-1.5 py-1 text-[11px] hover:bg-accent">
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
                      <div className="text-[10px] text-muted-foreground">{p.trackCount||"?"} 首{p.creator ? ` · ${p.creator.nickname}` : ""}</div>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <div className="border-b px-1.5 py-1">
                    <Button variant="ghost" size="sm" className="w-full text-[10px]" onClick={() => search(true)}>加载更多</Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="dj" className="flex-1 overflow-y-auto divide-y">
                {djRadios.map(r=>(
                  <div key={r.id} className="flex cursor-pointer items-center gap-1.5 px-1.5 py-1.5 hover:bg-accent" onClick={()=>loadDjRadio(r.id)}>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs">🎙️</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground">{r.programCount||"?"} 期{r.dj ? ` · ${r.dj.nickname}` : ""}</div>
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
          ) : (
            <>
              {/* Bilibili login bar */}
              <div className="flex items-center justify-between border-b px-2.5 py-1">
                {biliLoggedIn ? (
                  <span className="text-[10px] text-muted-foreground">👤 {biliUname || "已登录B站"}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">🔐 未登录</span>
                )}
                <Button
                  size="sm"
                  variant={biliLoggedIn ? "ghost" : "outline"}
                  className="h-5 text-[9px]"
                  onClick={onBiliLogin}
                >
                  {biliLoggedIn ? "切换" : "登录"}
                </Button>
              </div>
            <Tabs value={tab} onValueChange={handleTabChange} className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-1.5 mt-1 grid w-auto grid-cols-2">
                <TabsTrigger value="video" className="text-[10px] h-6">视频</TabsTrigger>
                <TabsTrigger value="fav" className="text-[10px] h-6">收藏夹</TabsTrigger>
              </TabsList>
              <TabsContent value="video" className="flex-1 overflow-y-auto">
                {songs.length>0 && (
                  <div className="border-b px-1.5 py-1">
                    <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={()=>{onAddSongs(songs);toast.success(`已添加 ${songs.length} 首`)}}>全部添加 ({songs.length})</Button>
                  </div>
                )}
                <div className="divide-y">
                  {songs.map((s,i)=>(
                    <div key={String(s.id)||i} className="flex items-center gap-1 px-1.5 py-1 text-[11px] hover:bg-accent">
                      <span className="shrink-0 text-[9px]" title="Bilibili">📺</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{s.name}</div>
                        <div className="truncate text-muted-foreground/70">UP: {s.artists}</div>
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
              <TabsContent value="fav" className="flex-1 overflow-y-auto">
                {biliLoggedIn ? (
                  favLoading ? (
                    <p className="p-4 text-center text-[11px] text-muted-foreground">加载中...</p>
                  ) : favFolders.length > 0 ? (
                    <div className="divide-y">
                      {favFolders.map((f) => (
                        <div
                          key={f.id}
                          className="flex cursor-pointer items-center gap-1.5 px-1.5 py-1.5 hover:bg-accent"
                          onClick={() => loadFavFolder(f.id)}
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs">
                            {favLoadingId === f.id ? "⏳" : "📁"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium">{f.title}</div>
                            <div className="text-[10px] text-muted-foreground">{f.mediaCount} 个视频</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-[11px] text-muted-foreground mb-1">👤 {biliUname || "已登录"}</p>
                      <p className="text-[10px] text-muted-foreground mb-2">暂无收藏夹或加载失败</p>
                      <Button size="sm" className="h-6 text-[10px]" onClick={fetchFavorites}>重新加载</Button>
                    </div>
                  )
                ) : (
                  <div className="p-4 text-center">
                    <p className="mb-2 text-[11px] text-muted-foreground">🔐 登录B站后可查看收藏夹</p>
                    <Button size="sm" className="h-6 text-[10px]" onClick={onBiliLogin}>扫码登录</Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
            </>
          )}
        </div>
      )}

      {/* My playlist panel (right of search) */}
      {myOpen && (
        <div className="flex w-60 shrink-0 flex-col border-l bg-background max-h-[calc(100vh-3.5rem)] overflow-hidden">
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
              const isCur = currentSong
                ? s.source === "bilibili"
                  ? s.bvid === (currentSong as Song).bvid
                  : s.id === currentSong.id
                : false;
              return (
                <div key={item.id} draggable onDragStart={e=>{e.dataTransfer.setData("idx",String(i))}} onDragOver={e=>e.preventDefault()} onDrop={e=>{
                  e.preventDefault(); const from=Number(e.dataTransfer.getData("idx")); if(from===i)return;
                  const u=[...mySongs]; const [m]=u.splice(from,1); u.splice(i,0,m); onReorder(u.map((x,j)=>({id:x.id,sortOrder:j})));
                }} className={`flex cursor-grab items-center gap-1 px-2 py-1 text-[11px] active:cursor-grabbing ${isCur?"bg-primary/10":"hover:bg-accent"}`}>
                  <span className="w-4 text-center tabular-nums text-muted-foreground">{String(i+1).padStart(2,"0")}</span>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                    {s.picUrl ? <img src={proxyImage(s.picUrl)} alt="" className="h-full w-full object-cover"/> : <span className="text-[7px]">{s.source === "bilibili" ? "📺" : "🎵"}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[10px] ${isCur?"font-medium text-primary":""}`}>{s.name}</div>
                    <div className="truncate text-[9px] text-muted-foreground/70">
                      {s.source === "bilibili" ? `UP: ${s.artists}` : s.artists}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">{fmt(s.duration)}</span>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="ml-0.5 text-muted-foreground hover:text-destructive text-[10px]">✕</button>
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
