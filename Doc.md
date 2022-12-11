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




## Queue Object

### Properties
`id`: The queue ID
`guildID`: The guild we're playing in
`authorID`: Creator of the queue (has full queue permissions)
`voiceConnection`: The VoiceConnection object
`audioPlayer`: Audio play for the voiceConnection
`playbackMessageID`: The ID of the current playback message
`playbackMessage`: Message object for the playback message
`songs`: Array of song objects
`volume`: Playback volume
`paused`: Whether the queue is currently being played
`currentSong`: Currently playing song (the index in the array)
`shuffle`: Shuffle status (true/false)
`repeat`: Song repeat (true/false)
`loop`: Queue loop (true/false) \[default: true\]
`textChannel`: The text channel we're subscribed to
`voiceChannel`: The voice channel we're currently playing in
`events`: EventEmitter of thrown Queue events.


### Events
`finish`, `song`: Song finished playing, includes the song object that finished
`finish-queue`, `song`: Queue finished playing, includes this queue object
`play`, `this.CurrentSong`: Playing a song, includes the ID of the song that playing
`pause`, `song`: Paused(), playback paused, includes the song that was playing
`next`, `this.CurrentSong`, `reason`: Next() called, playing next song, includes the current song Id and the reason for (I.E. undefined, UserRequest or EndOfSong)
`loop`, `this`: Queue looped, includes this queue object
`repeat`, `song`: Song looped, includes the song object
`previous`, `this.CurrentSong`: Previous() called, playing the previous song, includes the current song Id
`removed`, `song`: Removed a song from the queue, includes the song
`destroyed`, `this.Id`: Queue has been destroyed, non-recoverable. Includes this queue Id, although kinda useless 



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

`Next([song, reason])`: Skips the currently playing song in the queue. If paused, begins playback. If at the end of the queue, and reason is not because _"EndOfSong"_, moves the queue head to the beginning and starts playing (loops the queue).\
Reason is optional and can either be _"UserRequest"_ or _"EndOfSong"_ (_EndOfSong_ is to tell the function that the previous song finished and that is why we're moving on. `Next()` is called when a song finishes.)

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
`Id`: Id of the song (usually the index of the song in the queue's songs array)
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