/**
 * Seek controls button management.
 */

import { isVideoPage, isShortsPage } from '../utils/youtube.js';
import { waitForElement } from '../utils/events.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import {
    BUTTON_CLASS,
    BUTTON_CONTAINER_CLASS,
    BUTTON_UPDATE_THROTTLE_MS,
    BUTTON_WAIT_TIMEOUT_MS,
    SEEK_CONFIG,
} from './constants.js';

let _buttonsContainer = null;
let buttonEntries = [];
let buttonUpdateInProgress = false;
let buttonUpdateRequested = false;
let _buttonEnsureTimer = null;

export function getButtonsContainer() {
    return _buttonsContainer;
}

export function setButtonsContainer(container) {
    _buttonsContainer = container;
}

export function getButtonEnsureTimer() {
    return _buttonEnsureTimer;
}

export function setButtonEnsureTimer(timer) {
    _buttonEnsureTimer = timer;
}

export function buildSeekButtonsContainer() {
    const container = document.createElement('div');
    container.className = BUTTON_CONTAINER_CLASS;

    buttonEntries = [];

    SEEK_CONFIG.forEach((config) => {
        const backwardButton = createSeekButton(config.secondsKey, 'backward');
        const forwardButton = createSeekButton(config.secondsKey, 'forward');

        container.appendChild(backwardButton);
        container.appendChild(forwardButton);
    });

    return container;
}

export function createSeekButton(secondsKey, direction, settings, performSeek) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${BUTTON_CLASS} ${direction}`;
    button.dataset.secondsKey = secondsKey;
    button.dataset.direction = direction;

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const key = button.dataset.secondsKey;
        const buttonDirection = button.dataset.direction === 'backward' ? 'backward' : 'forward';
        const seconds = Number(settings[key]) || DEFAULT_SETTINGS.shortSeek;

        performSeek(seconds, buttonDirection);
    });

    buttonEntries.push(button);
    return button;
}

export function updateSeekButtons(settings) {
    buttonEntries.forEach((button) => {
        const secondsKey = button.dataset.secondsKey;
        const direction = button.dataset.direction === 'backward' ? 'backward' : 'forward';

        const seconds = Number(settings[secondsKey]) || DEFAULT_SETTINGS.shortSeek;
        button.textContent = String(seconds);
        button.title = `Seek ${direction} ${seconds} seconds`;
    });
}

export function removeSeekButtons() {
    if (_buttonsContainer) {
        _buttonsContainer.remove();
    }

    _buttonsContainer = null;
    buttonEntries = [];
}

export function resolveSeekButtonsMountPoint(totalTimeElement) {
    if (!totalTimeElement) {
        return null;
    }

    const timeDisplay =
        totalTimeElement.closest('.ytp-time-display') || totalTimeElement.parentElement;
    if (!timeDisplay || !timeDisplay.parentElement) {
        return null;
    }

    return {
        parent: timeDisplay.parentElement,
        anchor: timeDisplay,
    };
}

export async function createOrUpdateSeekButtons(settings, performSeek) {
    if (!isVideoPage() || isShortsPage()) {
        removeSeekButtons();
        return;
    }

    if (buttonUpdateInProgress) {
        buttonUpdateRequested = true;
        return;
    }

    buttonUpdateInProgress = true;

    try {
        let totalTime = document.querySelector('.ytp-time-duration');
        if (!totalTime) {
            try {
                totalTime = await waitForElement('.ytp-time-duration', BUTTON_WAIT_TIMEOUT_MS);
            } catch (_error) {
                return;
            }
        }

        const mountPoint = resolveSeekButtonsMountPoint(totalTime);
        if (!mountPoint) {
            return;
        }

        const { parent, anchor } = mountPoint;
        const desiredSibling = anchor.nextSibling;

        if (!_buttonsContainer || !_buttonsContainer.isConnected) {
            removeSeekButtons();
            _buttonsContainer = buildSeekButtonsContainer();
        }

        if (
            _buttonsContainer.parentElement !== parent ||
            _buttonsContainer.previousSibling !== anchor
        ) {
            parent.insertBefore(_buttonsContainer, desiredSibling);
        }

        updateSeekButtons(settings);
        _buttonsContainer.style.display = '';
    } catch (error) {
        // Debug logging handled by caller
    } finally {
        buttonUpdateInProgress = false;

        if (buttonUpdateRequested) {
            buttonUpdateRequested = false;
            createOrUpdateSeekButtons(settings, performSeek);
        }
    }
}

export function scheduleEnsureButtons(settings, performSeek) {
    if (_buttonEnsureTimer) {
        return;
    }

    _buttonEnsureTimer = setTimeout(() => {
        _buttonEnsureTimer = null;
        createOrUpdateSeekButtons(settings, performSeek);
    }, 140);
}

export function clearButtonTimers() {
    if (_buttonEnsureTimer) {
        clearTimeout(_buttonEnsureTimer);
        _buttonEnsureTimer = null;
    }
}

export function getButtonState() {
    return {
        buttonsContainer: _buttonsContainer,
        buttonEntries,
        buttonUpdateInProgress,
        buttonUpdateRequested,
        buttonEnsureTimer: _buttonEnsureTimer,
    };
}
