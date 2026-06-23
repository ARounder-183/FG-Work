"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

interface MySong {
  id: string;
  songData: string;
  sortOrder: number;
}

interface PlaylistResult {
  id: number;
  name: string;
  coverImgUrl?: string;
  trackCount?: number;
  creator?: { nickname: string };
}

interface DjRadio {
  id: number;
  name: string;
  coverUrl?: string;
  programCount?: number;
  dj?: { nickname: string };
}

function fmt(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = Math.floor(seconds % 60);
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function parseSong(raw: string): Song | null {
  try {
    return JSON.parse(raw) as Song;
  } catch {
    return null;
  }
}

interface Props {
  mySongs: MySong[];
  currentSong: Song | null;
  onReorder: (songs: Array<{ id: string; sortOrder: number }>) => void;
  onClear: () => void;
  onRandomize: () => void;
  onDelete: (id: string) => void;
  onAddSong: (song: Song) => void;
  onAddSongs: (songs: Song[]) => void;
  biliLoggedIn?: boolean;
  biliUname?: string;
  onBiliLogin?: () => void;
  onPhoneLogin?: () => void;
  onBiliLogout?: () => void;
}

export function RightPanels({
  mySongs,
  currentSong,
  onReorder,
  onClear,
  onRandomize,
  onDelete,
  onAddSong,
  onAddSongs,
  biliLoggedIn,
  biliUname,
  onBiliLogin,
  onPhoneLogin,
  onBiliLogout,
}: Props) {
  const [source, setSource] = useState<"ncm" | "bilibili">("ncm");
  const [tab, setTab] = useState("song");
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistResult[]>([]);
  const [djRadios, setDjRadios] = useState<DjRadio[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [favFolders, setFavFolders] = useState<Array<{ id: number; fid: number; title: string; mediaCount: number }>>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favLoadingId, setFavLoadingId] = useState<number | null>(null);
  const [favMediaId, setFavMediaId] = useState<number | null>(null);
  const [favPage, setFavPage] = useState(1);
  const [favHasMore, setFavHasMore] = useState(false);

  const search = async (append = false) => {
    if (!query.trim()) return;

    setSearching(true);
    const offset = append ? nextOffset : 0;
    const response = await fetch(
      apiUrl(`/api/music/search?q=${encodeURIComponent(query.trim())}&type=${tab}&source=${source}&offset=${offset}`),
    );
    const data = await response.json();

    const resultKey = tab === "song" || tab === "video" ? "songs" : tab === "dj" ? "djRadios" : "playlists";
    const current = tab === "song" || tab === "video" ? songs : tab === "dj" ? djRadios : playlists;
    const setFn = tab === "song" || tab === "video" ? setSongs : tab === "dj" ? setDjRadios : setPlaylists;

    setFn(append ? [...current, ...(data[resultKey] || [])] : (data[resultKey] || []));
    if (tab === "song" || tab === "video") {
      setPlaylists([]);
      setDjRadios([]);
    } else if (tab === "dj") {
      setSongs([]);
      setPlaylists([]);
    } else {
      setSongs([]);
      setDjRadios([]);
    }

    setHasMore(data.hasMore || false);
    setNextOffset(data.nextOffset || 0);
    setSearching(false);
  };

  const fetchFavorites = async () => {
    setFavLoading(true);
    try {
      const response = await fetch(apiUrl("/api/bilibili/fav/list"));
      const data = await response.json();
      if (data.folders) setFavFolders(data.folders);
    } catch {}
    setFavLoading(false);
  };

  const loadFavFolder = async (mediaId: number, append = false) => {
    setFavLoadingId(mediaId);
    try {
      const nextPage = append ? favPage + 1 : 1;
      const response = await fetch(apiUrl(`/api/bilibili/fav/detail?media_id=${mediaId}&page=${nextPage}`));
      const data = await response.json();

      if (data.songs?.length) {
        if (append) {
          setSongs((prev) => [...prev, ...data.songs]);
          setFavPage(nextPage);
        } else {
          setSongs(data.songs);
          setFavPage(1);
          setFavMediaId(mediaId);
          setTab("video");
          setFavFolders([]);
        }

        setFavHasMore(data.hasMore || false);
        toast.success(append ? `已加载更多 ${data.songs.length} 首` : `已导入收藏夹 ${data.songs.length} 首`);
      } else {
        toast.error("加载失败");
      }
    } catch {
      toast.error("加载失败");
    }
    setFavLoadingId(null);
  };

  const handleTabChange = (value: string) => {
    setTab(value);
    setHasMore(false);
    setNextOffset(0);
    if (value === "fav" && biliLoggedIn) {
      void fetchFavorites();
    }
  };

  const handleSourceChange = (nextSource: "ncm" | "bilibili") => {
    setSource(nextSource);
    setSongs([]);
    setPlaylists([]);
    setDjRadios([]);
    setFavFolders([]);
    setFavMediaId(null);
    setFavPage(1);
    setFavHasMore(false);
    setHasMore(false);
    setNextOffset(0);
    setTab(nextSource === "bilibili" ? "video" : "song");
    if (nextSource === "bilibili" && biliLoggedIn) {
      void fetchFavorites();
    }
  };

  const loadPlaylist = async (id: number) => {
    const response = await fetch(apiUrl(`/api/music/playlist?id=${id}`));
    const data = await response.json();
    if (data.playlist?.tracks) {
      setSongs(data.playlist.tracks);
      setTab("song");
      toast.success(`已加载 ${data.playlist.name}`);
      return;
    }
    toast.error("加载失败");
  };

  const loadDjRadio = async (id: number) => {
    const response = await fetch(apiUrl(`/api/music/dj?id=${id}`));
    const data = await response.json();
    if (data.songs?.length) {
      setSongs(data.songs);
      setTab("song");
      toast.success("已加载电台节目");
      return;
    }
    toast.error("加载失败");
  };

  const totalDuration = mySongs.reduce((sum, item) => {
    const song = parseSong(item.songData);
    return sum + (song?.duration || 0);
  }, 0);

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <section className="space-y-4 rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(250,250,250,0.95))] p-4 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Source</p>
            <h3 className="mt-1 text-lg font-semibold">找歌与导入</h3>
          </div>
          <div className="inline-flex rounded-full border border-border/70 bg-background/80 p-1 shadow-sm">
            <button
              onClick={() => handleSourceChange("ncm")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${source === "ncm" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              网易云
            </button>
            <button
              onClick={() => handleSourceChange("bilibili")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${source === "bilibili" ? "bg-foreground text-background" : "text-muted-foreground"}`}
            >
              Bilibili
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-[20px] border border-border/60 bg-background/82 p-3 shadow-sm">
          <div className="flex gap-2">
            <Input
              placeholder={source === "ncm" ? "搜单曲、歌单、播客" : "搜视频或导入收藏夹"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void search()}
              className="h-11 border-0 bg-muted/40"
            />
            <Button onClick={() => void search()} disabled={searching} className="h-11 px-4">
              {searching ? "搜索中" : "搜索"}
            </Button>
          </div>

          {source === "bilibili" ? (
            <div className="rounded-[18px] border border-border/60 bg-muted/30 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{biliLoggedIn ? biliUname || "已登录 Bilibili" : "B 站尚未登录"}</div>
                  <div className="text-xs text-muted-foreground">登录后可直接导入收藏夹里的视频音频。</div>
                </div>
                <div className="flex gap-2">
                  {biliLoggedIn ? (
                    <Button variant="outline" size="sm" onClick={onBiliLogout}>退出</Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={onBiliLogin}>扫码登录</Button>
                      <Button variant="ghost" size="sm" onClick={onPhoneLogin}>短信登录</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className={`grid w-full rounded-[16px] bg-muted/50 ${source === "ncm" ? "grid-cols-3" : "grid-cols-2"}`}>
            {source === "ncm" ? (
              <>
                <TabsTrigger value="song">单曲</TabsTrigger>
                <TabsTrigger value="playlist">歌单</TabsTrigger>
                <TabsTrigger value="dj">播客</TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="video">视频</TabsTrigger>
                <TabsTrigger value="fav">收藏夹</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="song" className="space-y-3">
            <ResultSection songs={songs} onAddSong={onAddSong} onAddSongs={onAddSongs} hasMore={hasMore} onLoadMore={() => void search(true)} />
          </TabsContent>

          <TabsContent value="video" className="space-y-3">
            <ResultSection songs={songs} onAddSong={onAddSong} onAddSongs={onAddSongs} hasMore={hasMore} onLoadMore={() => void search(true)} favHasMore={favHasMore && !!favMediaId} onLoadMoreFav={() => favMediaId && void loadFavFolder(favMediaId, true)} />
          </TabsContent>

          <TabsContent value="playlist" className="space-y-3">
            <div className="space-y-2">
              {playlists.map((playlist) => (
                <button key={playlist.id} onClick={() => void loadPlaylist(playlist.id)} className="flex w-full items-center gap-3 rounded-[18px] border border-border/60 bg-background/88 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm">🎵</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{playlist.name}</div>
                    <div className="text-xs text-muted-foreground">{playlist.trackCount || "?"} 首 {playlist.creator ? `· ${playlist.creator.nickname}` : ""}</div>
                  </div>
                </button>
              ))}
            </div>
            {hasMore ? <Button variant="outline" className="w-full" onClick={() => void search(true)}>加载更多歌单</Button> : null}
          </TabsContent>

          <TabsContent value="dj" className="space-y-3">
            <div className="space-y-2">
              {djRadios.map((radio) => (
                <button key={radio.id} onClick={() => void loadDjRadio(radio.id)} className="flex w-full items-center gap-3 rounded-[18px] border border-border/60 bg-background/88 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm">🎙️</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{radio.name}</div>
                    <div className="text-xs text-muted-foreground">{radio.programCount || "?"} 期 {radio.dj ? `· ${radio.dj.nickname}` : ""}</div>
                  </div>
                </button>
              ))}
            </div>
            {hasMore ? <Button variant="outline" className="w-full" onClick={() => void search(true)}>加载更多播客</Button> : null}
          </TabsContent>

          <TabsContent value="fav" className="space-y-3">
            {biliLoggedIn ? (
              favLoading ? (
                <div className="rounded-[18px] border border-border/60 bg-background/88 px-4 py-10 text-center text-sm text-muted-foreground">收藏夹加载中...</div>
              ) : favFolders.length > 0 ? (
                <div className="space-y-2">
                  {favFolders.map((folder) => (
                    <button key={folder.id} onClick={() => void loadFavFolder(folder.id)} className="flex w-full items-center gap-3 rounded-[18px] border border-border/60 bg-background/88 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm">{favLoadingId === folder.id ? "⏳" : "📁"}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{folder.title}</div>
                        <div className="text-xs text-muted-foreground">{folder.mediaCount} 个视频</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-border/60 bg-background/88 px-4 py-8 text-center">
                  <p className="text-sm font-medium">没有读取到收藏夹</p>
                  <p className="mt-1 text-xs text-muted-foreground">可能是收藏夹为空，也可能是 B 站接口这次没返回。</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => void fetchFavorites()}>重新加载</Button>
                </div>
              )
            ) : (
              <div className="rounded-[18px] border border-border/60 bg-background/88 px-4 py-8 text-center">
                <p className="text-sm font-medium">登录 B 站后才能读收藏夹</p>
                <p className="mt-1 text-xs text-muted-foreground">扫码登录最稳，短信登录适合临时补充。</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={onBiliLogin}>扫码登录</Button>
                  <Button variant="ghost" size="sm" onClick={onPhoneLogin}>短信登录</Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <section className="space-y-4 rounded-[24px] border border-border/60 bg-background/84 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">My Queue</p>
            <h3 className="mt-1 text-lg font-semibold">我的轮播队列</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{mySongs.length} 首</Badge>
            <Badge variant="secondary">总时长 {fmt(totalDuration)}</Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRandomize} disabled={mySongs.length === 0}>随机顺序</Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={mySongs.length === 0}>清空歌单</Button>
        </div>

        <div className="space-y-2">
          {mySongs.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              先搜索并加入歌曲，这里才会形成你的个人轮播。
            </div>
          ) : (
            mySongs.map((item, index) => {
              const song = parseSong(item.songData);
              const isCurrent = currentSong && song
                ? song.source === "bilibili"
                  ? song.bvid === currentSong.bvid
                  : song.id === currentSong.id
                : false;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("idx", String(index))}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = Number(event.dataTransfer.getData("idx"));
                    if (from === index) return;
                    const updated = [...mySongs];
                    const [moved] = updated.splice(from, 1);
                    updated.splice(index, 0, moved);
                    onReorder(updated.map((entry, sortOrder) => ({ id: entry.id, sortOrder })));
                  }}
                  className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 transition ${isCurrent ? "border-primary/35 bg-primary/8" : "border-border/60 bg-muted/15 hover:border-primary/25 hover:bg-primary/5"}`}
                >
                  <div className="w-7 text-center font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                    {song?.picUrl ? (
                      <img src={proxyImage(song.picUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs">{song?.source === "bilibili" ? "📺" : "🎵"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>{song?.name || "无效歌曲"}</div>
                    <div className="truncate text-xs text-muted-foreground">{song?.source === "bilibili" ? `UP: ${song.artists}` : song?.artists || "未知作者"}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="font-mono tabular-nums">{song ? fmt(song.duration) : "--:--"}</div>
                    {isCurrent ? <div className="text-primary">正在播放</div> : null}
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => onDelete(item.id)} aria-label="删除歌曲">✕</Button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function ResultSection({
  songs,
  onAddSong,
  onAddSongs,
  hasMore,
  onLoadMore,
  favHasMore,
  onLoadMoreFav,
}: {
  songs: Song[];
  onAddSong: (song: Song) => void;
  onAddSongs: (songs: Song[]) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  favHasMore?: boolean;
  onLoadMoreFav?: () => void;
}) {
  return (
    <div className="space-y-3">
      {songs.length > 0 ? (
        <Button variant="outline" className="w-full" onClick={() => onAddSongs(songs)}>
          全部加入队列 ({songs.length})
        </Button>
      ) : null}

      <div className="space-y-2">
        {songs.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            还没有结果，先搜一轮试试。
          </div>
        ) : (
          songs.map((song, index) => (
            <div key={String(song.id) || index} className="flex items-center gap-3 rounded-[18px] border border-border/60 bg-background/88 px-4 py-3 transition hover:border-primary/40 hover:bg-primary/5">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {song.picUrl ? (
                  <img src={proxyImage(song.picUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs">{song.source === "bilibili" ? "📺" : "🎵"}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{song.name}</div>
                <div className="truncate text-xs text-muted-foreground">{song.source === "bilibili" ? `UP: ${song.artists}` : song.artists}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div className="font-mono tabular-nums">{fmt(song.duration)}</div>
                <div>{song.source === "bilibili" ? "视频" : "音频"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onAddSong(song)}>加入</Button>
            </div>
          ))
        )}
      </div>

      {hasMore ? <Button variant="ghost" className="w-full" onClick={onLoadMore}>加载更多结果</Button> : null}
      {favHasMore && onLoadMoreFav ? <Button variant="ghost" className="w-full" onClick={onLoadMoreFav}>加载更多收藏夹歌曲</Button> : null}
    </div>
  );
}
