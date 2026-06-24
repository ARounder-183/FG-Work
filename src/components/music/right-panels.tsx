"use client";

import { apiUrl, proxyImage } from "@/lib/url";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { HoverTooltip } from "@/components/ui/hover-tooltip";
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
  searchOpen: boolean;
  onToggleSearch: () => void;
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
  searchOpen,
  onToggleSearch,
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
    <div className="flex h-full min-h-0">
      {searchOpen ? (
        <section className="flex h-full w-1/2 min-w-0 flex-col overflow-hidden border-r border-border/60 bg-background">
          <div className="space-y-4 border-b border-border/60 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">找歌</h3>
              <div className="inline-flex rounded-full border border-border bg-muted/50 p-1">
                <button
                  onClick={() => handleSourceChange("ncm")}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${source === "ncm" ? "bg-background text-foreground" : "text-muted-foreground"}`}
                >
                  网易云
                </button>
                <button
                  onClick={() => handleSourceChange("bilibili")}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${source === "bilibili" ? "bg-background text-foreground" : "text-muted-foreground"}`}
                >
                  Bilibili
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={source === "ncm" ? "搜单曲、歌单、播客" : "搜视频或导入收藏夹"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void search()}
                className="h-10"
              />
              <Button onClick={() => void search()} disabled={searching} className="h-10 px-4">
                {searching ? "搜索中" : "搜索"}
              </Button>
            </div>

            {source === "bilibili" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-3">
                <div className="text-sm font-medium">{biliLoggedIn ? biliUname || "已登录 Bilibili" : "B 站未登录"}</div>
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
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
            <Tabs value={tab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col gap-4">
              <TabsList className={`grid w-full ${source === "ncm" ? "grid-cols-3" : "grid-cols-2"}`}>
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

              <TabsContent value="song" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex">
                <ResultSection songs={songs} onAddSong={onAddSong} onAddSongs={onAddSongs} hasMore={hasMore} onLoadMore={() => void search(true)} />
              </TabsContent>

              <TabsContent value="video" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex">
                <ResultSection songs={songs} onAddSong={onAddSong} onAddSongs={onAddSongs} hasMore={hasMore} onLoadMore={() => void search(true)} favHasMore={favHasMore && !!favMediaId} onLoadMoreFav={() => favMediaId && void loadFavFolder(favMediaId, true)} />
              </TabsContent>

              <TabsContent value="playlist" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex">
                <PanelList
                  empty="还没有歌单结果。"
                  items={playlists.map((playlist) => ({
                    id: playlist.id,
                    icon: "🎵",
                    title: playlist.name,
                    meta: `${playlist.trackCount || "?"} 首${playlist.creator ? ` · ${playlist.creator.nickname}` : ""}`,
                    action: () => void loadPlaylist(playlist.id),
                  }))}
                  loadMore={hasMore ? { label: "加载更多歌单", action: () => void search(true) } : undefined}
                />
              </TabsContent>

              <TabsContent value="dj" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex">
                <PanelList
                  empty="还没有播客结果。"
                  items={djRadios.map((radio) => ({
                    id: radio.id,
                    icon: "🎙️",
                    title: radio.name,
                    meta: `${radio.programCount || "?"} 期${radio.dj ? ` · ${radio.dj.nickname}` : ""}`,
                    action: () => void loadDjRadio(radio.id),
                  }))}
                  loadMore={hasMore ? { label: "加载更多播客", action: () => void search(true) } : undefined}
                />
              </TabsContent>

              <TabsContent value="fav" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex">
                {biliLoggedIn ? (
                  favLoading ? (
                    <EmptyState text="收藏夹加载中..." />
                  ) : favFolders.length > 0 ? (
                    <PanelList
                      empty="没有读取到收藏夹。"
                      items={favFolders.map((folder) => ({
                        id: folder.id,
                        icon: favLoadingId === folder.id ? "⏳" : "📁",
                        title: folder.title,
                        meta: `${folder.mediaCount} 个视频`,
                        action: () => void loadFavFolder(folder.id),
                      }))}
                    />
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-border/60 bg-muted/20 px-4 py-8 text-center">
                      <p className="text-sm font-medium">没有读取到收藏夹</p>
                      <Button variant="outline" size="sm" className="mx-auto mt-4" onClick={() => void fetchFavorites()}>重新加载</Button>
                    </div>
                  )
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl border border-border/60 bg-muted/20 px-4 py-8 text-center">
                    <p className="text-sm font-medium">登录后才能读取收藏夹</p>
                    <div className="mt-4 flex justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={onBiliLogin}>扫码登录</Button>
                      <Button variant="ghost" size="sm" onClick={onPhoneLogin}>短信登录</Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>
      ) : null}

      <section className={`flex h-full min-w-0 flex-col overflow-hidden bg-background ${searchOpen ? "w-1/2" : "w-full"}`}>
        <div className="space-y-3 border-b border-border/60 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">我的歌单</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{mySongs.length} 首</Badge>
              <Badge variant="secondary">总时长 {fmt(totalDuration)}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onToggleSearch}>
              {searchOpen ? "收起找歌" : "添加歌曲"}
            </Button>
            <Button variant="outline" size="sm" onClick={onRandomize} disabled={mySongs.length === 0}>随机顺序</Button>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={mySongs.length === 0}>清空歌单</Button>
          </div>
          <Separator />
        </div>

        <div className="min-h-0 flex-1 px-4 py-4 sm:px-5">
          <div className="h-full min-h-0 space-y-1.5 overflow-y-auto pr-1.5">
            {mySongs.length === 0 ? (
              <EmptyState text={searchOpen ? "在左侧搜歌后加入歌单。" : "点击「添加歌曲」搜索后加入。"} />
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
                    className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition ${isCurrent ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background"}`}
                  >
                    <div className="w-5 shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">{index + 1}</div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {song?.picUrl ? (
                        <img src={proxyImage(song.picUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px]">{song?.source === "bilibili" ? "📺" : "🎵"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <HoverTooltip className={`truncate text-[13px] font-medium leading-tight ${isCurrent ? "text-primary" : "text-foreground"}`} label={song?.name}>{song?.name || "无效歌曲"}</HoverTooltip>
                      <HoverTooltip className="truncate text-[11px] leading-tight text-muted-foreground" label={song?.source === "bilibili" ? `UP: ${song.artists}` : song?.artists}>{song?.source === "bilibili" ? `UP: ${song.artists}` : song?.artists || "未知作者"}</HoverTooltip>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      <div className="font-mono tabular-nums">{song ? fmt(song.duration) : "--:--"}</div>
                      {isCurrent ? <div className="text-primary">播放中</div> : null}
                    </div>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => onDelete(item.id)} aria-label="删除歌曲">✕</Button>
                  </div>
                );
              })
            )}
          </div>
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {songs.length > 0 ? (
        <Button variant="outline" className="w-full" onClick={() => onAddSongs(songs)}>
          全部加入队列 ({songs.length})
        </Button>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {songs.length === 0 ? (
          <EmptyState text="还没有结果。" />
        ) : (
          songs.map((song, index) => (
            <div key={String(song.id) || index} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {song.picUrl ? (
                  <img src={proxyImage(song.picUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs">{song.source === "bilibili" ? "📺" : "🎵"}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <HoverTooltip className="truncate text-sm font-medium" label={song.name}>{song.name}</HoverTooltip>
                <HoverTooltip className="truncate text-xs text-muted-foreground" label={song.source === "bilibili" ? `UP: ${song.artists}` : song.artists}>{song.source === "bilibili" ? `UP: ${song.artists}` : song.artists}</HoverTooltip>
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

function PanelList({
  items,
  empty,
  loadMore,
}: {
  items: Array<{ id: number; icon: string; title: string; meta: string; action: () => void }>;
  empty: string;
  loadMore?: { label: string; action: () => void };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {items.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={item.action}
              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3 text-left"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-sm">{item.icon}</div>
              <div className="min-w-0 flex-1">
                <HoverTooltip className="truncate text-sm font-medium" label={item.title}>{item.title}</HoverTooltip>
                <HoverTooltip className="truncate text-xs text-muted-foreground" label={item.meta}>{item.meta}</HoverTooltip>
              </div>
            </button>
          ))
        )}
      </div>
      {loadMore ? <Button variant="outline" className="w-full" onClick={loadMore.action}>{loadMore.label}</Button> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
