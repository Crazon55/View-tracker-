// A text box that saves itself, without fighting you while you type.
//
// These fields used to call the API on every keystroke and then render whatever came
// back. A round trip takes a moment, so the value on screen was always a few characters
// behind your fingers, and each reply overwrote what you'd typed since — letters
// vanished, or came back in the wrong order. Like texting on a numeric keypad.
//
// So the box owns its own text. You type into local state, which is instant. The save
// goes out once you've paused, and again on blur to catch the last word. Incoming values
// from the server are only accepted while the box is idle: not focused, nothing
// unsaved. Otherwise a background refresh landing mid-sentence would undo you.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

const PAUSE_MS = 500;

export function SavedField({ value, onSave, multiline = false, ...props }) {
  const [local, setLocal] = useState(value ?? "");
  const dirty = useRef(false);
  const focused = useRef(false);
  const timer = useRef(null);

  // Take the server's value only when we're not in the middle of something.
  useEffect(() => {
    if (!focused.current && !dirty.current) setLocal(value ?? "");
  }, [value]);

  const flush = useCallback((text) => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onSave(text);
  }, [onSave]);

  // Don't lose the last few characters if the card closes before the pause elapses.
  useEffect(() => () => {
    if (dirty.current) onSave(localRef.current);
    clearTimeout(timer.current);
  }, [onSave]);

  // A ref alongside the state, so the unmount cleanup above reads the latest text
  // rather than whatever it closed over on first render.
  const localRef = useRef(local);
  localRef.current = local;

  const change = (e) => {
    const next = e.target.value;
    setLocal(next);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), PAUSE_MS);
  };

  const Field = multiline ? Textarea : Input;
  return (
    <Field
      {...props}
      value={local}
      onChange={change}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; flush(localRef.current); }}
    />
  );
}
