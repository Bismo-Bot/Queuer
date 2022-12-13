	    ____  _                    
	   / __ )(_)________ ___  ____ 
	  / __  / / ___/ __ `__ \/ __ \
	 / /_/ / (__  ) / / / / / /_/ /
	/_____/_/____/_/ /_/ /_/\____/  Discord Bot Framework
	
            Yet Another JS/Discord Framework/Bot

# Queuer Plugin
Queuer is a plugin designed to streamline and manage audio playback on Bismo.

Having multiple plugins all trying to play audio to voice chat can be problematic as only one audio source can be played at one time.  Queuer solves this by _being_ the only audio source at any given time, allowing other plugins to "queue" up audio to be played.  You can equate this to a play-queue on Spotify or YouTube for Chromecast.

Queuer works with Bismo's internal audio manager by locking focus to Queuer.  Outside plugins can integrate with the Queuer API to request Queuer releases audio focus if, for whatever reason, the plugin does *not* want to, or cannot, integrate with the queue system of Queuer.

We ask that all plugins that play audio to respect Queuer or at the very minimum Bismo's internal audio management.

### Public API calls
`.GetQueue(queueID[, additionalData])`: Returns the queue object of a queue with the ID queueID, or, uses additionalData to find the queue.\
Find the queue using the queueID, or additional data (VC ID->TC ID->Guild ID).

`.CreateQueue(queueData)`



### Events



### Permissions
Permissions are handled by the Queuer Plugin and are as follows:
Create: `queuer.manage.create` (default: true)
Delete (destroy): `queuer.manage.delete` (default: true)
Disconnect: `queuer.manage.disconnect` (default: true)

Set (queue playback) volume: `queuer.playback.volume` (default: false)
Play: `queuer.playback.play` (default: true)
Pause: `queuer.playback.pause` (default: true)
Stop: `queuer.playback.stop` (default: true)
Repeat: `queuer.playback.repeat` (default: true)
	Queue: `queuer.playback.repeat.queue` (default: true)
	Song: `queuer.playback.repeat.song` (default: true)

Next: `queuer.playback.next` (default: true)
Vote next: `queuer.playback.next.vote` (default: true)
Previous: `queuer.playback.previous` (default: true)
Vote previous: `queuer.playback.previous.vote` (default: true)



Add (song): `queuer.manage.add` (default: true)
Remove (song): `queuer.manage.remove` (default: true)
Move (song): `queuer.manage.move` (default: true)
Shuffle: `queuer.manage.shuffle` (default: true)


Save the current queue `queuer.save`
	for the guild to use: `queuer.save.guild` (default: false)
	themselves: `queuer.save.personal` (default: true)

Load (and set) the current queue: `queuer.load`
	from the guild: `queuer.load.guild` (default: false)
	from themselves (personal store): `queuer.load.personal` (default: true)


Appending `.outsidevc` covers these permissions if the user is NOT inside the same voice channel as the queue.


These permissions are inside the `Queuer.Permissions` object, with the default permission (allow / disallow) set in `Queuer.PermissionDefaults`.

Permissions are to be handled by YOUR plugin (for the time being). Your plugin MUST check the permissions using `Queuer.HasPermission(guildId, userId, permission)` (you can use `Bismo.Permissions.UserHasPermission(guildId, userId, permission)`, but be sure to check the default permissions if the user does not have the permission set.)
Realistically you only need to check the `Queuer.Permissions.Add` permission since queue management is done via the Queuer command itself.

Same is for telling the user they do not have permission. You can get pre-written messages from `Queuer.GetPermissionMessage(permission)`, which returns the unauthorized message for a given message.



## Queue Object
Songs are kept inside a plain array, `#Songs`. This array is Last-In First-Out (LIFO), that is the song at index 0 is played before the song at index 2. This array does NOT get modified unless to add or remove a song.\
The order the songs are played in is determined by the `#SongsOrder` array, which is an array of numbers that represents the index of the song in the `#Songs` array.\
The index of the first song to be played is stored at `#SongsOrder[0]`, we then use that number to grab the song we want to play first: `#Songs[#SongsOrder[0]]`.
The next song is grabbed via `#Songs[#SongsOrder[1]]`.\
`#SongsOrder[0]` -> first song in the queue.
`#SongsOrder[1]` -> second song in the queue.
`#SongsOrder[2]` -> third song in the queue.

Only the values of the `#SongsOrder` change to "reorder" the queue. If the array is empty or undefined, we move through `#Songs` from 0->#Songs.length\
We know where we're at using the `#HeadIndex` property which is the current index we use with `#SongsOrder`.



### Properties
`#Id`: The queue ID (UUID)
`Id`: Read-only, returns private property `#Id`
`GuildId`: Read-only, the guild the BismoVoiceChannel.ChannelObject is inside (guild we're playing in).
`AuthorId`: Creator of the queue (has full queue permissions)


`#BismoVoiceChannel`: VoiceManager `BismoVoiceChannel` for the VoiceChannel we're in. Handles things such as VoiceChannel changes, disconnects, etc.
`BismoVoiceChannel`: Read-only, returns private property `#BismoVoiceChannel`.
`VoiceChannel`: Read-only, returns `#BismoVoiceChannel.ChannelObject` (a `Discord.VoiceChannel`)
`VoiceConnection`: Read-only, returns `#BismoVoiceChannel.GetVoiceConnection()`

`#BismoAudioPlayer`: BismoAudioPlayer for the VoiceChannel
`BismoAudioPlayer`: Read-only, returns private property `#BismoVoiceChannel`


`#PlaybackMessage`: Message object for the playback message (which is inside the VoiceChannel text channel)
`PlaybackMessage`: Read-only, returns private property `#PlaybackMessage`
`ReusePlaybackMessage`: Boolean, if true we edit the #PlaybackMessage on queue status change. If false, or the PlaybackMessage is not editable, we delete the previous playback message and send a new one on queue status change. Defaults to true.

`#SongsOrder`: The playback order of songs inside `#Songs` (`#Songs[#SongsOrder[songNumber]]`)
`#Songs`: Array of song objects (the queue)
`Songs`: Returns the songs in the order they appear in `#SongsOrder`. If set, removes all songs then adds the provided songs in and plays and sets the `#HeadIndex` to the beginning
`#HeadIndex`: Current index of the song being played (index related to `#SongsOrder` .. `(#Songs[#SongsOrder[#HeadIndex]])`)
`HeadIndex`: Current song number playing related to the queue (song X in the queue).



`#Paused`: Whether the queue is currently being played
`Paused`: Pauses the queue if set to true (via `Pause()`) or plays the queue if set to false (via `Play()`) depending if true or not. Returns `#Paused`.
`#PausedReason`: Reason we're paused. Can be "LostFocus" (BismoAudioPlayer no longer in focus inside the BismoVoiceChannel), "UserRequest" (called `Pause()`, or "Stopped" (hit the end of the queue).
`PausedReason`: Read-only, returns private property `#PausedReason`
`#CurrentSong`: Currently playing song object
`CurrentSong`: Returns `#CurrentSong` if reading, or calls `Play(value)` if setting.
`#Shuffle`: Shuffle status (true/false)
`Shuffle`: Returns `#Shuffle` if reading, or calls `Shuffle(value)` if setting.
`#Repeat`: Song repeat (0 = disabled, 1 = repeat (queue), 2 = loop (song))
`Repeat`: Returns `#Repeat` if reading, or calls `Repeat(value)` if setting.


`#NextVotes`: Array of user ids (strings) of users voting to skip the current song
`#PreviousVotes`: Array of user ids (strings) of users voting to go to the previous song
`VoteThreshold`: Percentage of users required to vote in order for the votes to go through (.6 => 60% of the voice channel users (minus bots) must vote before a vote goes through)




### Events
`songFinish`, `{ song: Song }`: Song finished playing, includes the song object that finished
`finish`: Queue finished playing
`play`, `{ song: Song }`: Playing a song, includes the now playing song object
`pause`, `{ song: Song }`: Paused(), playback paused, includes the song that was playing
`next`, `{ nextSong: Song, previousSong: Song }`, Playing next song, includes the next song object and previously playing song object
`loop`: Queue repeated (looped)
`repeat`, `{ song: Song }`: Song repeated, includes the song object
`previous`, `{ previousSong: Song, currentSong: Song }`: Previous() called, playing the previous song, includes the previous song object (about to play) and currently playing song object (about to no longer be playing).
`removed`, `{ song: Song }`: Removed a song from the queue, includes the song
`destroyed`: Queue has been destroyed, non-recoverable. 



### Methods
`constructor(guildID, voiceChannel, data)`: Creates a new Queue
`guildID`: String, guild that is hosting this queue
`voiceChannel`: Discord.VoiceChannel, the voice channel the queue is going to be playing in
`data`: Object:
	`data.textChannel`: Text channel the link the queue to (also where the playback message will go)
	`data.authorID`: Creator of the queue
	`data.queueID`: Optional queue ID (if none provided, we'll hash the guild+voiceChannel+randomString using sha1)

`GetSong(id, offset)`: Find a Song with id _id_ (song.id, not index). _Offset_ allows you to find the next song, previous song, etc, by using 1, -1, etc. (We find the correct song using the _id_, then offset the song's index in the Songs array by _offset_.)\
If the offset is too large/small we just return the last/first song

`.JoinVoiceChannel()`: Joins the voice channel `this.voiceChannel` _IF_ we have permissions to connect and speak (`"CONNECT"` and `"SPEAK"`. The `this.voiceChannel` also _must_ be of type `"GUILD_VOICE"` (guild voice channel) or `"DM"` (personal call)).\
Will require update to compile with Bismo's voiceConnection/audioPlayer manager\
Currently will create a new VoiceConnection by forcing a join, while also creating a new audioPlayer.

`async CreatePlaybackMessage()`: Sends a message to `textChannel` which will display current queue info (playing back, song title, etc). Pins message to text channel if possible, allows play/pause controls via message

`Play([song])`: Starts playing the queue (or if song specified, moves the queue head to that song and begins playing)

`Pause([song])`: Pauses playback (only if song is undefined, or the ID provided is the currently playing song)

`Next([song, reason])`: Skips the currently playing song in the queue. If paused, begins playback.
`VoteNext(userId: string)`: Marks the user id as voting to skip this 

`Add(song[, options])`: Adds a song to the queue. _If this is the first song added, begins playback_\
`options`:
	`index`: Inserts a song into the queue at this index (2 would mean the second song in the queue)
	`nextInQueue`: Moves the song to play next, marks the song to be temporary (deleted after playing).


`Repeat([enable, track = false])`: Toggle repeat mode for the queue, song or none. No loop -> queue loop -> repeat track.
	`enable`: If defined, the loop/repeat status will be set to this value
	`track`: If true, the `enable` parameter is applied to the track (repeat on/off). If false, the `enable` parameter is applied to the queue as a whole (loop on/off).


`Shuffle([enable])`: Toggle shuffle mode.\
Shuffle is random rather than the "genius" shuffle used on major platforms, so it may sound less "random".  Reorders the `songs` array, when disabled sets the array back up to whatever the IDs were


`Remove(song[, count)`: Removes a song from the queue.\
If specified, removes `count` number of tracks after that song as well.  So `Remove(2, 3)` will remove the 2nd song in the queue AND the 2 songs after it, meaning song 2,3, and 4 will be removed.  The array `songs` will be fixed and IDs will be reassigned for tracks


`Move(song, toSong[, options])`: Move a song to an another song's location
`options`:
	`MoveOptions.After` (0): place `song` after `toSong` in the queue
	`MoveOptions.Before` (1): place `song` before `toSong` in the queue
	`MoveOptions.Switch` (2): swap `song` and `toSong`

`SetVolume(volume)`: Set the current queue volume


`Stop()`: Pauses playback and disconnects from the voice connection.  Queue remains available

`Destroy()`: Deletes playbackMessage, stops playback, disconnects from the voice channel and destroys the voiceConnection, audioPlayer and deletes all songs.  Use this to essentially remove the queue.


`UpdatePlaybackMessage()`: Resets the playbackMessage to reflect current queue playback.


`Save(name, authorID, saveOptions)`: Saves the queue to disk (Queuer plugin wrapper?)



## Song Object

### Properties
`Id`: String, id of the song (UUID)
`OriginalId`: Copy of the above, however, does not change when shuffle is enabled
`Title`: Title of the song
`Repeat`: Does the song loop when it ends?
`Queue`: The parent queue
`Temporary`: Does the song play once?
`Metadata`: Song metadata. Includes `Artist`, `Album`, `Duration`, `Year`, `AddedByUserID`
`PluginData`: Data from the creating plugin.\
	**Must** include the `PluginPackageName` and can optionally include `MethodName` and `PersistentData`.\
	`PluginPackageName` must be included in-order for Queuer to obtain the ReadableStreamData in-order to create a DiscordVoice.AudioResource.\
	`MethodName`: This is the method we'll call (using the PluginPackageName) and the plugin's public API. We obtain the method using `Bismo.GetPluginMethod(this.PluginData.PluginPackageName, this.PluginData.MethodName, true)`, and then call the method passing `this` song object as the first and only parameter.
`AudioResource`: Created by parent queue


### Methods
`constructor(title, metadata, PluginData[, queue, isTemporary])`: Creates a new Song object
	`title`: Title of the song\
	`metadata`: Metadata of the song _See `this.Metadata`_\
	`pluginData`: Plugin data, _See `this.PluginData`_\
	`queue`: Parent queue we're apart of
	`isTemporary`: Play song next and then destroy


`constructor(data)`: Used **only** if you're loading from JSON or string.  Calls `FromString()` or `FromJson()` depending what data type is passed.



`GetStreamData()`: Gets the ReadableStream or string from the author plugin using the PluginPackageName and MethodName.  This data is used to create a DiscordAudio.AudioResource

`Play()`: Calls `this.Queue.Play(this)`\
`Pause()`: Calls `this.Queue.Pause(this)`\
`Skip()`: Calls `this.Queue.Next(this)`\
`Seek()`: Calls `this.Queue.SeekSong(this)`\
`Repeat(bool)`: Toggles `this.Repeat` or sets it to `bool` _(if `bool` is type `boolean`)_\
`ToJson()`: Takes key song properties from _this song_ and puts them into an object. (Sterilize this song object)\
`ToString()`: Stringifies `ToJson()`\
`FromJson(data[, queue])`: Sets _this_ song object properties to those given by the JSON.  (Load a song from JSON)\
`FromString(string[, queue])`: Parses the string data passed in, then calls `FromJson()` to construct a Song object given a string.  `queue` is used to set the parent queue.