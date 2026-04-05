/**
 * Playlist Multi-Select state management.
 */

import { createSelectionRangeController } from './selectionRange.js';

let _isInitialized = false;
let _isEnabled = true;
let _selectionMode = false;
let _playlistPanelVisible = false;
let _createModalVisible = false;
let _createVisibilityMenuVisible = false;
let _loadingPlaylists = false;
let _submitting = false;
let _createSubmitting = false;
let _mastheadSlot = null;
let _mastheadButton = null;
let _mastheadBadge = null;
let _actionBar = null;
let _actionCount = null;
let _actionTotalCount = null;
let _actionWatchLaterButton = null;
let _actionSaveButton = null;
let _actionQuickCreateButton = null;
let _actionSplitButton = null;
let _actionRemoveButton = null;
let _actionRemoveWatchedButton = null;
let _actionDeletePlaylistsButton = null;
let _actionSelectAllButton = null;
let _actionUnselectAllButton = null;
let _actionOpenAllButton = null;
let _actionExitButton = null;
let _progressBar = null;
let _progressBarLabel = null;
let _progressBarElement = null;
let _progressBarFill = null;
let _progressBarCount = null;
let _playlistPanel = null;
let _playlistPanelCount = null;
let _playlistPanelList = null;
let _playlistPanelStatus = null;
let _playlistPanelCloseButton = null;
let _playlistPanelNewButton = null;
let _createBackdrop = null;
let _createModal = null;
let _splitBackdrop = null;
let _splitModal = null;
let _splitCountInput = null;
let _splitStatus = null;
let _splitSubmitting = false;
let _createTitleInput = null;
let _createVisibilityButton = null;
let _createVisibilityValue = null;
let _createVisibilityMenu = null;
let _createCollaborateInput = null;
let _createCancelButton = null;
let _createCreateButton = null;
let _createStatus = null;
let _observer = null;
let _pendingContainers = new Set();
let _renderScheduled = false;
let _deferredRescanTimer = null;
let _loadPlaylistsDebounced = null;
let _lastKnownUrl = location.href;
let _statusTimer = null;
let _postSaveResetTimer = null;
let _lastPlaylistProbeVideoId = '';
let _createVisibility = 'PRIVATE';
let _selectAllMode = false;
let _isDragging = false;
let _dragOffsetX = 0;
let _dragOffsetY = 0;
let _isDragPositioned = false;
const _selectedVideoIds = new Set();
const _selectedPlaylistIds = new Set();
const _cleanupCallbacks = [];
const _playlistMap = new Map();
const _decorateRetryCounts = new WeakMap();
let _cachedPageVideoCount = 0;
let _playlistOptions = [];
const selectionRangeController = createSelectionRangeController();
const WATCH_LATER_PLAYLIST_ID = 'WL';

export const state = {
    get isInitialized() { return _isInitialized; }, set isInitialized(v) { _isInitialized = v; },
    get isEnabled() { return _isEnabled; }, set isEnabled(v) { _isEnabled = v; },
    get selectionMode() { return _selectionMode; }, set selectionMode(v) { _selectionMode = v; },
    get playlistPanelVisible() { return _playlistPanelVisible; }, set playlistPanelVisible(v) { _playlistPanelVisible = v; },
    get createModalVisible() { return _createModalVisible; }, set createModalVisible(v) { _createModalVisible = v; },
    get createVisibilityMenuVisible() { return _createVisibilityMenuVisible; }, set createVisibilityMenuVisible(v) { _createVisibilityMenuVisible = v; },
    get loadingPlaylists() { return _loadingPlaylists; }, set loadingPlaylists(v) { _loadingPlaylists = v; },
    get submitting() { return _submitting; }, set submitting(v) { _submitting = v; },
    get createSubmitting() { return _createSubmitting; }, set createSubmitting(v) { _createSubmitting = v; },
    get mastheadSlot() { return _mastheadSlot; }, set mastheadSlot(v) { _mastheadSlot = v; },
    get mastheadButton() { return _mastheadButton; }, set mastheadButton(v) { _mastheadButton = v; },
    get mastheadBadge() { return _mastheadBadge; }, set mastheadBadge(v) { _mastheadBadge = v; },
    get actionBar() { return _actionBar; }, set actionBar(v) { _actionBar = v; },
    get actionCount() { return _actionCount; }, set actionCount(v) { _actionCount = v; },
    get actionTotalCount() { return _actionTotalCount; }, set actionTotalCount(v) { _actionTotalCount = v; },
    get actionWatchLaterButton() { return _actionWatchLaterButton; }, set actionWatchLaterButton(v) { _actionWatchLaterButton = v; },
    get actionSaveButton() { return _actionSaveButton; }, set actionSaveButton(v) { _actionSaveButton = v; },
    get actionQuickCreateButton() { return _actionQuickCreateButton; }, set actionQuickCreateButton(v) { _actionQuickCreateButton = v; },
    get actionSplitButton() { return _actionSplitButton; }, set actionSplitButton(v) { _actionSplitButton = v; },
    get actionRemoveButton() { return _actionRemoveButton; }, set actionRemoveButton(v) { _actionRemoveButton = v; },
    get actionRemoveWatchedButton() { return _actionRemoveWatchedButton; }, set actionRemoveWatchedButton(v) { _actionRemoveWatchedButton = v; },
    get actionDeletePlaylistsButton() { return _actionDeletePlaylistsButton; }, set actionDeletePlaylistsButton(v) { _actionDeletePlaylistsButton = v; },
    get actionSelectAllButton() { return _actionSelectAllButton; }, set actionSelectAllButton(v) { _actionSelectAllButton = v; },
    get actionUnselectAllButton() { return _actionUnselectAllButton; }, set actionUnselectAllButton(v) { _actionUnselectAllButton = v; },
    get actionOpenAllButton() { return _actionOpenAllButton; }, set actionOpenAllButton(v) { _actionOpenAllButton = v; },
    get actionExitButton() { return _actionExitButton; }, set actionExitButton(v) { _actionExitButton = v; },
    get progressBar() { return _progressBar; }, set progressBar(v) { _progressBar = v; },
    get progressBarLabel() { return _progressBarLabel; }, set progressBarLabel(v) { _progressBarLabel = v; },
    get progressBarElement() { return _progressBarElement; }, set progressBarElement(v) { _progressBarElement = v; },
    get progressBarFill() { return _progressBarFill; }, set progressBarFill(v) { _progressBarFill = v; },
    get progressBarCount() { return _progressBarCount; }, set progressBarCount(v) { _progressBarCount = v; },
    get playlistPanel() { return _playlistPanel; }, set playlistPanel(v) { _playlistPanel = v; },
    get playlistPanelCount() { return _playlistPanelCount; }, set playlistPanelCount(v) { _playlistPanelCount = v; },
    get playlistPanelList() { return _playlistPanelList; }, set playlistPanelList(v) { _playlistPanelList = v; },
    get playlistPanelStatus() { return _playlistPanelStatus; }, set playlistPanelStatus(v) { _playlistPanelStatus = v; },
    get playlistPanelCloseButton() { return _playlistPanelCloseButton; }, set playlistPanelCloseButton(v) { _playlistPanelCloseButton = v; },
    get playlistPanelNewButton() { return _playlistPanelNewButton; }, set playlistPanelNewButton(v) { _playlistPanelNewButton = v; },
    get createBackdrop() { return _createBackdrop; }, set createBackdrop(v) { _createBackdrop = v; },
    get createModal() { return _createModal; }, set createModal(v) { _createModal = v; },
    get splitBackdrop() { return _splitBackdrop; }, set splitBackdrop(v) { _splitBackdrop = v; },
    get splitModal() { return _splitModal; }, set splitModal(v) { _splitModal = v; },
    get splitCountInput() { return _splitCountInput; }, set splitCountInput(v) { _splitCountInput = v; },
    get splitStatus() { return _splitStatus; }, set splitStatus(v) { _splitStatus = v; },
    get splitSubmitting() { return _splitSubmitting; }, set splitSubmitting(v) { _splitSubmitting = v; },
    get createTitleInput() { return _createTitleInput; }, set createTitleInput(v) { _createTitleInput = v; },
    get createVisibilityButton() { return _createVisibilityButton; }, set createVisibilityButton(v) { _createVisibilityButton = v; },
    get createVisibilityValue() { return _createVisibilityValue; }, set createVisibilityValue(v) { _createVisibilityValue = v; },
    get createVisibilityMenu() { return _createVisibilityMenu; }, set createVisibilityMenu(v) { _createVisibilityMenu = v; },
    get createCollaborateInput() { return _createCollaborateInput; }, set createCollaborateInput(v) { _createCollaborateInput = v; },
    get createCancelButton() { return _createCancelButton; }, set createCancelButton(v) { _createCancelButton = v; },
    get createCreateButton() { return _createCreateButton; }, set createCreateButton(v) { _createCreateButton = v; },
    get createStatus() { return _createStatus; }, set createStatus(v) { _createStatus = v; },
    get observer() { return _observer; }, set observer(v) { _observer = v; },
    get pendingContainers() {
        return _pendingContainers;
    },
    get renderScheduled() { return _renderScheduled; }, set renderScheduled(v) { _renderScheduled = v; },
    get deferredRescanTimer() { return _deferredRescanTimer; }, set deferredRescanTimer(v) { _deferredRescanTimer = v; },
    get loadPlaylistsDebounced() { return _loadPlaylistsDebounced; }, set loadPlaylistsDebounced(v) { _loadPlaylistsDebounced = v; },
    get lastKnownUrl() { return _lastKnownUrl; }, set lastKnownUrl(v) { _lastKnownUrl = v; },
    get statusTimer() { return _statusTimer; }, set statusTimer(v) { _statusTimer = v; },
    get postSaveResetTimer() { return _postSaveResetTimer; }, set postSaveResetTimer(v) { _postSaveResetTimer = v; },
    get lastPlaylistProbeVideoId() { return _lastPlaylistProbeVideoId; }, set lastPlaylistProbeVideoId(v) { _lastPlaylistProbeVideoId = v; },
    get createVisibility() { return _createVisibility; }, set createVisibility(v) { _createVisibility = v; },
    get selectAllMode() { return _selectAllMode; }, set selectAllMode(v) { _selectAllMode = v; },
    get isDragging() { return _isDragging; }, set isDragging(v) { _isDragging = v; },
    get dragOffsetX() { return _dragOffsetX; }, set dragOffsetX(v) { _dragOffsetX = v; },
    get dragOffsetY() { return _dragOffsetY; }, set dragOffsetY(v) { _dragOffsetY = v; },
    get isDragPositioned() { return _isDragPositioned; }, set isDragPositioned(v) { _isDragPositioned = v; },
    get selectedVideoIds() {
        return _selectedVideoIds;
    },
    get selectedPlaylistIds() {
        return _selectedPlaylistIds;
    },
    get cleanupCallbacks() {
        return _cleanupCallbacks;
    },
    get playlistMap() {
        return _playlistMap;
    },
    get decorateRetryCounts() {
        return _decorateRetryCounts;
    },
    get cachedPageVideoCount() { return _cachedPageVideoCount; }, set cachedPageVideoCount(v) { _cachedPageVideoCount = v; },
    get playlistOptions() { return _playlistOptions; }, set playlistOptions(v) { _playlistOptions = v; },
    get selectionRangeController() {
        return selectionRangeController;
    },
    get WATCH_LATER_PLAYLIST_ID() {
        return WATCH_LATER_PLAYLIST_ID;
    },
};

export function resetState() {
    _isInitialized = false;
    _isEnabled = true;
    _selectionMode = false;
    _playlistPanelVisible = false;
    _createModalVisible = false;
    _createVisibilityMenuVisible = false;
    _loadingPlaylists = false;
    _submitting = false;
    _createSubmitting = false;
    _observer = null;
    _pendingContainers.clear();
    _renderScheduled = false;
    _deferredRescanTimer = null;
    _loadPlaylistsDebounced = null;
    _lastKnownUrl = location.href;
    _statusTimer = null;
    _postSaveResetTimer = null;
    _lastPlaylistProbeVideoId = '';
    _createVisibility = 'PRIVATE';
    _selectAllMode = false;
    _isDragging = false;
    _dragOffsetX = 0;
    _dragOffsetY = 0;
    _isDragPositioned = false;
    _selectedVideoIds.clear();
    _selectedPlaylistIds.clear();
    _cleanupCallbacks.length = 0;
    _playlistMap.clear();
    _decorateRetryCounts = new WeakMap();
    _cachedPageVideoCount = 0;
    _playlistOptions = [];
}
