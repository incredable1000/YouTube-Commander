/**
 * Subscription Manager state management.
 */

let _isInitialized = false;
let _mastheadSlot = null;
let _mastheadButton = null;

let _overlay = null;
let _modal = null;
let _cardsWrap = null;
let _mainWrap = null;
let _statusEl = null;
let _statusTimeoutId = 0;
let _selectionBadgeEl = null;
let _clearSelectionButton = null;
let _selectionGroupEl = null;
let _selectionHeaderEl = null;
let _selectionCountEl = null;
let _floatingStackEl = null;
let _sortButton = null;
let _sidebar = null;
let _sidebarList = null;
let _sidebarToggleButton = null;
let _sidebarAddButton = null;
let _sidebarCountEl = null;
let _chipbarWheelTarget = null;
let _chipbarWheelHandler = null;
let _chipbarScrollTarget = null;
let _chipbarScrollHandler = null;
let _chipbarPrevButton = null;
let _chipbarNextButton = null;
let _addCategoryButton = null;
let _removeCategoryButton = null;
let _unsubscribeButton = null;

let _picker = null;
let _pickerMode = 'toggle';
let _pickerTargetIds = [];
let _pickerAnchorEl = null;
let _pickerContextAnchor = null;
let _pickerContextChannelId = '';
let _sidebarCollapsed = false;
let _sidebarEditingId = '';
let _sidebarEditingName = '';
let _sidebarCreating = false;
let _sidebarDraftName = '';
let _sidebarDraftColor = '';
let _confirmBackdrop = null;
let _confirmTitleEl = null;
let _confirmMessageEl = null;
let _confirmResolve = null;
let _tooltipPortal = null;
let _tooltipPortalTarget = null;

let _refreshButton = null;
let _channels = [];
let _channelsFetchedAt = 0;
let _lastFetchAttemptAt = 0;
let _channelsVersion = 0;
let _channelsById = new Map();
let _channelsByHandle = new Map();
let _channelsByUrl = new Map();
let _categories = [];
let _assignments = {};
let _categoriesVersion = 0;
let _assignmentsVersion = 0;
let _assignmentCache = new Map();
let _categoryCountsCache = null;
let _categoryCountsCacheKey = '';
let _lastSnapshotHash = '';
let _filterMode = 'all';
let _sortMode = 'name';
let _selectedChannelIds = new Set();
let _resetScrollPending = false;
let _selectionAnchorId = '';
let _currentPageIds = [];
let _cardById = new Map();
let _quickAddRetryTimer = 0;
let _suppressContextMenu = false;
let _suppressContextMenuTimer = 0;
let _isCtrlPressed = false;
let _lastCtrlDownAt = 0;
let _suppressNextClick = false;
let _suppressNextClickTimer = 0;

let _quickAddObserver = null;
let _quickAddPending = false;
let _filteredChannelsCache = [];
let _cardRowHeight = 312;
let _cardColumns = 1;
let _lastCardRange = null;
let _virtualScrollRaf = 0;
let _pendingVirtualForce = false;

export const state = {
    get isInitialized() {
        return _isInitialized;
    },
    set isInitialized(v) {
        _isInitialized = v;
    },

    get mastheadSlot() {
        return _mastheadSlot;
    },
    set mastheadSlot(v) {
        _mastheadSlot = v;
    },
    get mastheadButton() {
        return _mastheadButton;
    },
    set mastheadButton(v) {
        _mastheadButton = v;
    },

    get overlay() {
        return _overlay;
    },
    set overlay(v) {
        _overlay = v;
    },
    get modal() {
        return _modal;
    },
    set modal(v) {
        _modal = v;
    },
    get cardsWrap() {
        return _cardsWrap;
    },
    set cardsWrap(v) {
        _cardsWrap = v;
    },
    get mainWrap() {
        return _mainWrap;
    },
    set mainWrap(v) {
        _mainWrap = v;
    },
    get statusEl() {
        return _statusEl;
    },
    set statusEl(v) {
        _statusEl = v;
    },
    get statusTimeoutId() {
        return _statusTimeoutId;
    },
    set statusTimeoutId(v) {
        _statusTimeoutId = v;
    },
    get selectionBadgeEl() {
        return _selectionBadgeEl;
    },
    set selectionBadgeEl(v) {
        _selectionBadgeEl = v;
    },
    get clearSelectionButton() {
        return _clearSelectionButton;
    },
    set clearSelectionButton(v) {
        _clearSelectionButton = v;
    },
    get selectionGroupEl() {
        return _selectionGroupEl;
    },
    set selectionGroupEl(v) {
        _selectionGroupEl = v;
    },
    get selectionHeaderEl() {
        return _selectionHeaderEl;
    },
    set selectionHeaderEl(v) {
        _selectionHeaderEl = v;
    },
    get selectionCountEl() {
        return _selectionCountEl;
    },
    set selectionCountEl(v) {
        _selectionCountEl = v;
    },
    get floatingStackEl() {
        return _floatingStackEl;
    },
    set floatingStackEl(v) {
        _floatingStackEl = v;
    },
    get sortButton() {
        return _sortButton;
    },
    set sortButton(v) {
        _sortButton = v;
    },
    get sidebar() {
        return _sidebar;
    },
    set sidebar(v) {
        _sidebar = v;
    },
    get sidebarList() {
        return _sidebarList;
    },
    set sidebarList(v) {
        _sidebarList = v;
    },
    get sidebarToggleButton() {
        return _sidebarToggleButton;
    },
    set sidebarToggleButton(v) {
        _sidebarToggleButton = v;
    },
    get sidebarAddButton() {
        return _sidebarAddButton;
    },
    set sidebarAddButton(v) {
        _sidebarAddButton = v;
    },
    get sidebarCountEl() {
        return _sidebarCountEl;
    },
    set sidebarCountEl(v) {
        _sidebarCountEl = v;
    },
    get chipbarPrevButton() {
        return _chipbarPrevButton;
    },
    set chipbarPrevButton(v) {
        _chipbarPrevButton = v;
    },
    get chipbarNextButton() {
        return _chipbarNextButton;
    },
    set chipbarNextButton(v) {
        _chipbarNextButton = v;
    },
    get addCategoryButton() {
        return _addCategoryButton;
    },
    set addCategoryButton(v) {
        _addCategoryButton = v;
    },
    get removeCategoryButton() {
        return _removeCategoryButton;
    },
    set removeCategoryButton(v) {
        _removeCategoryButton = v;
    },
    get unsubscribeButton() {
        return _unsubscribeButton;
    },
    set unsubscribeButton(v) {
        _unsubscribeButton = v;
    },

    get picker() {
        return _picker;
    },
    set picker(v) {
        _picker = v;
    },
    get pickerMode() {
        return _pickerMode;
    },
    set pickerMode(v) {
        _pickerMode = v;
    },
    get pickerTargetIds() {
        return _pickerTargetIds;
    },
    set pickerTargetIds(v) {
        _pickerTargetIds = v;
    },
    get pickerAnchorEl() {
        return _pickerAnchorEl;
    },
    set pickerAnchorEl(v) {
        _pickerAnchorEl = v;
    },
    get pickerContextAnchor() {
        return _pickerContextAnchor;
    },
    set pickerContextAnchor(v) {
        _pickerContextAnchor = v;
    },
    get pickerContextChannelId() {
        return _pickerContextChannelId;
    },
    set pickerContextChannelId(v) {
        _pickerContextChannelId = v;
    },
    get sidebarCollapsed() {
        return _sidebarCollapsed;
    },
    set sidebarCollapsed(v) {
        _sidebarCollapsed = v;
    },
    get sidebarEditingId() {
        return _sidebarEditingId;
    },
    set sidebarEditingId(v) {
        _sidebarEditingId = v;
    },
    get sidebarEditingName() {
        return _sidebarEditingName;
    },
    set sidebarEditingName(v) {
        _sidebarEditingName = v;
    },
    get sidebarCreating() {
        return _sidebarCreating;
    },
    set sidebarCreating(v) {
        _sidebarCreating = v;
    },
    get sidebarDraftName() {
        return _sidebarDraftName;
    },
    set sidebarDraftName(v) {
        _sidebarDraftName = v;
    },
    get sidebarDraftColor() {
        return _sidebarDraftColor;
    },
    set sidebarDraftColor(v) {
        _sidebarDraftColor = v;
    },
    get confirmBackdrop() {
        return _confirmBackdrop;
    },
    set confirmBackdrop(v) {
        _confirmBackdrop = v;
    },
    get confirmTitleEl() {
        return _confirmTitleEl;
    },
    set confirmTitleEl(v) {
        _confirmTitleEl = v;
    },
    get confirmMessageEl() {
        return _confirmMessageEl;
    },
    set confirmMessageEl(v) {
        _confirmMessageEl = v;
    },
    get confirmResolve() {
        return _confirmResolve;
    },
    set confirmResolve(v) {
        _confirmResolve = v;
    },
    get tooltipPortal() {
        return _tooltipPortal;
    },
    set tooltipPortal(v) {
        _tooltipPortal = v;
    },
    get tooltipPortalTarget() {
        return _tooltipPortalTarget;
    },
    set tooltipPortalTarget(v) {
        _tooltipPortalTarget = v;
    },

    get refreshButton() {
        return _refreshButton;
    },
    set refreshButton(v) {
        _refreshButton = v;
    },
    get channels() {
        return _channels;
    },
    set channels(v) {
        _channels = v;
    },
    get channelsFetchedAt() {
        return _channelsFetchedAt;
    },
    set channelsFetchedAt(v) {
        _channelsFetchedAt = v;
    },
    get lastFetchAttemptAt() {
        return _lastFetchAttemptAt;
    },
    set lastFetchAttemptAt(v) {
        _lastFetchAttemptAt = v;
    },
    get channelsVersion() {
        return _channelsVersion;
    },
    set channelsVersion(v) {
        _channelsVersion = v;
    },
    get channelsById() {
        return _channelsById;
    },
    set channelsById(v) {
        _channelsById = v;
    },
    get channelsByHandle() {
        return _channelsByHandle;
    },
    set channelsByHandle(v) {
        _channelsByHandle = v;
    },
    get channelsByUrl() {
        return _channelsByUrl;
    },
    set channelsByUrl(v) {
        _channelsByUrl = v;
    },
    get categories() {
        return _categories;
    },
    set categories(v) {
        _categories = v;
    },
    get assignments() {
        return _assignments;
    },
    set assignments(v) {
        _assignments = v;
    },
    get categoriesVersion() {
        return _categoriesVersion;
    },
    set categoriesVersion(v) {
        _categoriesVersion = v;
    },
    get assignmentsVersion() {
        return _assignmentsVersion;
    },
    set assignmentsVersion(v) {
        _assignmentsVersion = v;
    },
    get assignmentCache() {
        return _assignmentCache;
    },
    set assignmentCache(v) {
        _assignmentCache = v;
    },
    get categoryCountsCache() {
        return _categoryCountsCache;
    },
    set categoryCountsCache(v) {
        _categoryCountsCache = v;
    },
    get categoryCountsCacheKey() {
        return _categoryCountsCacheKey;
    },
    set categoryCountsCacheKey(v) {
        _categoryCountsCacheKey = v;
    },
    get lastSnapshotHash() {
        return _lastSnapshotHash;
    },
    set lastSnapshotHash(v) {
        _lastSnapshotHash = v;
    },
    get filterMode() {
        return _filterMode;
    },
    set filterMode(v) {
        _filterMode = v;
    },
    get sortMode() {
        return _sortMode;
    },
    set sortMode(v) {
        _sortMode = v;
    },
    get selectedChannelIds() {
        return _selectedChannelIds;
    },
    set selectedChannelIds(v) {
        _selectedChannelIds = v;
    },
    get resetScrollPending() {
        return _resetScrollPending;
    },
    set resetScrollPending(v) {
        _resetScrollPending = v;
    },
    get selectionAnchorId() {
        return _selectionAnchorId;
    },
    set selectionAnchorId(v) {
        _selectionAnchorId = v;
    },
    get currentPageIds() {
        return _currentPageIds;
    },
    set currentPageIds(v) {
        _currentPageIds = v;
    },
    get cardById() {
        return _cardById;
    },
    set cardById(v) {
        _cardById = v;
    },
    get quickAddRetryTimer() {
        return _quickAddRetryTimer;
    },
    set quickAddRetryTimer(v) {
        _quickAddRetryTimer = v;
    },
    get suppressContextMenu() {
        return _suppressContextMenu;
    },
    set suppressContextMenu(v) {
        _suppressContextMenu = v;
    },
    get suppressContextMenuTimer() {
        return _suppressContextMenuTimer;
    },
    set suppressContextMenuTimer(v) {
        _suppressContextMenuTimer = v;
    },
    get isCtrlPressed() {
        return _isCtrlPressed;
    },
    set isCtrlPressed(v) {
        _isCtrlPressed = v;
    },
    get lastCtrlDownAt() {
        return _lastCtrlDownAt;
    },
    set lastCtrlDownAt(v) {
        _lastCtrlDownAt = v;
    },
    get suppressNextClick() {
        return _suppressNextClick;
    },
    set suppressNextClick(v) {
        _suppressNextClick = v;
    },
    get suppressNextClickTimer() {
        return _suppressNextClickTimer;
    },
    set suppressNextClickTimer(v) {
        _suppressNextClickTimer = v;
    },

    get quickAddObserver() {
        return _quickAddObserver;
    },
    set quickAddObserver(v) {
        _quickAddObserver = v;
    },
    get quickAddPending() {
        return _quickAddPending;
    },
    set quickAddPending(v) {
        _quickAddPending = v;
    },
    get filteredChannelsCache() {
        return _filteredChannelsCache;
    },
    set filteredChannelsCache(v) {
        _filteredChannelsCache = v;
    },
    get cardRowHeight() {
        return _cardRowHeight;
    },
    set cardRowHeight(v) {
        _cardRowHeight = v;
    },
    get cardColumns() {
        return _cardColumns;
    },
    set cardColumns(v) {
        _cardColumns = v;
    },
    get lastCardRange() {
        return _lastCardRange;
    },
    set lastCardRange(v) {
        _lastCardRange = v;
    },
    get virtualScrollRaf() {
        return _virtualScrollRaf;
    },
    set virtualScrollRaf(v) {
        _virtualScrollRaf = v;
    },
    get pendingVirtualForce() {
        return _pendingVirtualForce;
    },
    set pendingVirtualForce(v) {
        _pendingVirtualForce = v;
    },
};

export function resetState() {
    _isInitialized = false;
    _mastheadSlot = null;
    _mastheadButton = null;
    _overlay = null;
    _modal = null;
    _cardsWrap = null;
    _mainWrap = null;
    _statusEl = null;
    if (_statusTimeoutId) {
        window.clearTimeout(_statusTimeoutId);
        _statusTimeoutId = 0;
    }
    _selectionBadgeEl = null;
    _clearSelectionButton = null;
    _selectionGroupEl = null;
    _selectionHeaderEl = null;
    _selectionCountEl = null;
    _floatingStackEl = null;
    _sortButton = null;
    _sidebar = null;
    _sidebarList = null;
    _sidebarToggleButton = null;
    _sidebarAddButton = null;
    _sidebarCountEl = null;
    _chipbarWheelTarget = null;
    _chipbarWheelHandler = null;
    _chipbarScrollTarget = null;
    _chipbarScrollHandler = null;
    _chipbarPrevButton = null;
    _chipbarNextButton = null;
    _addCategoryButton = null;
    _removeCategoryButton = null;
    _unsubscribeButton = null;
    _picker = null;
    _pickerAnchorEl = null;
    _pickerTargetIds = [];
    _pickerMode = 'toggle';
    _confirmBackdrop = null;
    _confirmTitleEl = null;
    _confirmMessageEl = null;
    _confirmResolve = null;
    _tooltipPortal = null;
    _tooltipPortalTarget = null;
    _refreshButton = null;
    _channels = [];
    _channelsFetchedAt = 0;
    _lastFetchAttemptAt = 0;
    _channelsVersion = 0;
    _channelsById = new Map();
    _channelsByHandle = new Map();
    _channelsByUrl = new Map();
    _categories = [];
    _assignments = {};
    _categoriesVersion = 0;
    _assignmentsVersion = 0;
    _assignmentCache.clear();
    _categoryCountsCache = null;
    _categoryCountsCacheKey = '';
    _lastSnapshotHash = '';
    _filterMode = 'all';
    _sortMode = 'name';
    _selectedChannelIds = new Set();
    _resetScrollPending = false;
    _selectionAnchorId = '';
    _currentPageIds = [];
    _cardById.clear();
    _quickAddRetryTimer = 0;
    _suppressContextMenu = false;
    _suppressContextMenuTimer = 0;
    _isCtrlPressed = false;
    _lastCtrlDownAt = 0;
    _suppressNextClick = false;
    _suppressNextClickTimer = 0;
    _quickAddObserver = null;
    _quickAddPending = false;
    _filteredChannelsCache = [];
    _cardRowHeight = 312;
    _cardColumns = 1;
    _lastCardRange = null;
    _virtualScrollRaf = 0;
    _pendingVirtualForce = false;
}
