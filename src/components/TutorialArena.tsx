import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, GraduationCap, SkipForward, X } from 'lucide-react';
import { soundFX } from '../game/audio';
import { stepGame } from '../game/engine';
import { TILE_SIZE } from '../game/map';
import { renderGameCanvas } from '../game/renderer';
import {
  TUTORIAL_LOCAL_ID,
  TUTORIAL_STEPS,
  TutorialStepId,
  createTutorialGameState,
} from '../game/tutorial';
import type { GameState, PlayerInput, SurvivorClassId } from '../game/types';

interface TutorialArenaProps {
  playerName: string;
  preferredClass: SurvivorClassId;
  onComplete: () => void;
}

interface StepProgress {
  step1MovedToZone: boolean;
  step1Sprinted: boolean;
  step2UsedQ: boolean;
  step2UsedE: boolean;
  step3Revived: boolean;
  step4BrokeTurret: boolean;
  step4AttackOrDash: boolean;
}

const INITIAL_PROGRESS: StepProgress = {
  step1MovedToZone: false,
  step1Sprinted: false,
  step2UsedQ: false,
  step2UsedE: false,
  step3Revived: false,
  step4BrokeTurret: false,
  step4AttackOrDash: false,
};

function emptyInput(angle = 0): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    angle,
    attack: false,
    attackHeld: false,
    useQ: false,
    useE: false,
    useR: false,
    useCtrl: false,
    holdF: false,
  };
}

export function TutorialArena({ playerName, preferredClass, onComplete }: TutorialArenaProps) {
  const [step, setStep] = useState<TutorialStepId>(1);
  const [progress, setProgress] = useState<StepProgress>(INITIAL_PROGRESS);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(createTutorialGameState(1, playerName, preferredClass));
  const sprintAccumRef = useRef(0);
  const inputRef = useRef<PlayerInput>(emptyInput(0));

  const loadStep = useCallback(
    (nextStep: TutorialStepId) => {
      sprintAccumRef.current = 0;
      inputRef.current = emptyInput(0);
      stateRef.current = createTutorialGameState(nextStep, playerName, preferredClass);
      setStep(nextStep);
    },
    [playerName, preferredClass]
  );

  // Keyboard & mouse listeners for playable tutorial arena
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') inputRef.current.up = true;
      else if (key === 's' || key === 'arrowdown') inputRef.current.down = true;
      else if (key === 'a' || key === 'arrowleft') inputRef.current.left = true;
      else if (key === 'd' || key === 'arrowright') inputRef.current.right = true;
      else if (e.key === 'Shift') inputRef.current.sprint = true;
      else if (key === 'q') inputRef.current.useQ = true;
      else if (key === 'e') inputRef.current.useE = true;
      else if (key === 'r') inputRef.current.useR = true;
      else if (e.key === 'Control') inputRef.current.useCtrl = true;
      else if (key === 'f') inputRef.current.holdF = true;
      else if (e.code === 'Space') {
        e.preventDefault();
        inputRef.current.attack = true;
        inputRef.current.attackHeld = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') inputRef.current.up = false;
      else if (key === 's' || key === 'arrowdown') inputRef.current.down = false;
      else if (key === 'a' || key === 'arrowleft') inputRef.current.left = false;
      else if (key === 'd' || key === 'arrowright') inputRef.current.right = false;
      else if (e.key === 'Shift') inputRef.current.sprint = false;
      else if (key === 'f') inputRef.current.holdF = false;
      else if (key === 'q') inputRef.current.useQ = false;
      else if (key === 'e') inputRef.current.useE = false;
      else if (key === 'r') inputRef.current.useR = false;
      else if (e.key === 'Control') inputRef.current.useCtrl = false;
      else if (e.code === 'Space') {
        inputRef.current.attack = false;
        inputRef.current.attackHeld = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const st = stateRef.current;
      const me = st.players.find((p) => p.id === TUTORIAL_LOCAL_ID);
      if (!me) return;
      const camX = Math.max(0, Math.min(st.mapWidth - rect.width, me.x - rect.width / 2));
      const camY = Math.max(0, Math.min(st.mapHeight - rect.height, me.y - rect.height / 2));
      inputRef.current.angle = Math.atan2(camY + my - me.y, camX + mx - me.x);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        inputRef.current.attack = true;
        inputRef.current.attackHeld = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        inputRef.current.attack = false;
        inputRef.current.attackHeld = false;
      }
    };
    const onBlur = () => {
      inputRef.current = emptyInput(inputRef.current.angle);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // 60fps tutorial simulation & render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const inp = { ...inputRef.current };

      stepGame(
        st,
        {
          [TUTORIAL_LOCAL_ID]: inp,
          tut_killer_dummy: emptyInput(Math.PI),
          tut_downed_ally: emptyInput(0),
          tut_surv_dummy: emptyInput(Math.PI),
        },
        dt
      );

      inputRef.current.useQ = false;
      inputRef.current.useE = false;
      inputRef.current.useR = false;
      inputRef.current.useCtrl = false;
      inputRef.current.attack = false;

      // Keep tutorial state safe and endless until user advances
      st.timeRemaining = 180;
      st.phase = 'playing';

      const me = st.players.find((p) => p.id === TUTORIAL_LOCAL_ID);
      if (me) {
        if (st.soundEvents.length > 0) {
          soundFX.playEvents(st.soundEvents, me.x, me.y);
        }

        // Keep player healthy in training
        if (me.role === 'survivor') {
          me.hp = Math.max(me.maxHp * 0.7, me.hp);
          me.downed = false;
          me.dead = false;
        }

        if (step === 1) {
          // Keep zone visual alive
          const zone = st.effects.find((fx) => fx.id === 'tut_zone');
          if (zone) zone.ttl = 999;

          const movedNearZone = Math.hypot(me.x - 21 * TILE_SIZE, me.y - 11 * TILE_SIZE) <= 72;
          const isMoving = Math.hypot(me.vx, me.vy) > 40;
          if (inp.sprint && isMoving) {
            sprintAccumRef.current += dt;
          }
          const sprintedEnough = sprintAccumRef.current >= 0.45;
          if (movedNearZone || sprintedEnough) {
            setProgress((prev) => {
              if (
                prev.step1MovedToZone === (prev.step1MovedToZone || movedNearZone) &&
                prev.step1Sprinted === (prev.step1Sprinted || sprintedEnough)
              ) {
                return prev;
              }
              return {
                ...prev,
                step1MovedToZone: prev.step1MovedToZone || movedNearZone,
                step1Sprinted: prev.step1Sprinted || sprintedEnough,
              };
            });
          }
        } else if (step === 2) {
          const dummy = st.players.find((p) => p.id === 'tut_killer_dummy');
          const stunnedOrUsedQ = Boolean((dummy && dummy.stunTimer > 0) || me.cdQ > 0);
          const usedE = me.dodgeTimer > 0 || me.cdE > 0;
          if (stunnedOrUsedQ || usedE) {
            setProgress((prev) => {
              const nextQ = prev.step2UsedQ || stunnedOrUsedQ;
              const nextE = prev.step2UsedE || usedE;
              if (prev.step2UsedQ === nextQ && prev.step2UsedE === nextE) return prev;
              return { ...prev, step2UsedQ: nextQ, step2UsedE: nextE };
            });
          }
        } else if (step === 3) {
          const ally = st.players.find((p) => p.id === 'tut_downed_ally');
          if (ally && ally.downed) {
            ally.hp = Math.max(55, ally.hp);
          }
          const revived = Boolean(me.rescues > 0 || (ally && !ally.downed));
          if (revived) {
            setProgress((prev) => (prev.step3Revived ? prev : { ...prev, step3Revived: true }));
          }
        } else if (step === 4) {
          const survDummy = st.players.find((p) => p.id === 'tut_surv_dummy');
          if (survDummy) {
            survDummy.dead = false;
            survDummy.downed = false;
            if (survDummy.hp < 30) survDummy.hp = 100;
          }
          const brokeTurret = st.turrets.length === 0;
          const usedAttackOrDash = me.cdQ > 0 || me.damageDealt > 0 || st.doors.some((d) => d.lockHits > 0 || d.broken);
          if (brokeTurret || usedAttackOrDash) {
            setProgress((prev) => {
              const nTur = prev.step4BrokeTurret || brokeTurret;
              const nAtk = prev.step4AttackOrDash || usedAttackOrDash;
              if (prev.step4BrokeTurret === nTur && prev.step4AttackOrDash === nAtk) return prev;
              return { ...prev, step4BrokeTurret: nTur, step4AttackOrDash: nAtk };
            });
          }
        }
      }

      // Render canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const w = window.innerWidth;
          const h = window.innerHeight;
          if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderGameCanvas(ctx, st, TUTORIAL_LOCAL_ID, w, h);
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const currentSpec = TUTORIAL_STEPS.find((s) => s.id === step) ?? TUTORIAL_STEPS[0];

  const objectives: { label: string; done: boolean }[] =
    step === 1
      ? [
          { label: 'Yeşil eğitim halkasına yürü (W A S D)', done: progress.step1MovedToZone },
          { label: 'Shift ile koş (Stamina kullan)', done: progress.step1Sprinted },
        ]
      : step === 2
      ? [
          { label: 'Eğitim katiline Q (Sersemleten Yumruk) at', done: progress.step2UsedQ },
          { label: 'E (Dodge Duruşu) yeteneğini aktifleştir', done: progress.step2UsedE },
        ]
      : step === 3
      ? [{ label: 'Aylin’e yaklaş ve F tuşuna basılı tutarak kurtar', done: progress.step3Revived }]
      : [
          { label: 'Turuncu tareti Sol Tık veya Space ile yok et', done: progress.step4BrokeTurret },
          { label: 'Q (Ezici Dash) veya kapı/hedefe saldır', done: progress.step4AttackOrDash },
        ];

  const stepComplete = objectives.every((o) => o.done);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070a10] select-none">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {/* Top Interactive Tutorial Guide Bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 p-4 flex flex-col items-center gap-3">
        <div className="pointer-events-auto max-w-3xl w-full bg-[#0b101b]/95 border border-slate-700/80 rounded-xl p-4 shadow-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <GraduationCap className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[11px] font-mono text-amber-400">
                  EĞİTİCİ ARENA · ADIM {step} / {TUTORIAL_STEPS.length}
                </div>
                <h2 className="font-display text-lg font-bold text-white leading-tight">
                  {currentSpec.title}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => loadStep((step + 1) as TutorialStepId)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    stepComplete
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <span>{stepComplete ? 'Sonraki Adım' : 'Adımı Geç'}</span>
                  {stepComplete ? (
                    <ArrowRight className="w-3.5 h-3.5" />
                  ) : (
                    <SkipForward className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onComplete}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    stepComplete
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  <span>Eğiticiyi Tamamla</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={onComplete}
                title="Eğiticiyi kapat ve lobiye dön"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Lobiye Dön</span>
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{currentSpec.hint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {objectives.map((obj) => (
              <div
                key={obj.label}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                  obj.done
                    ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-300'
                    : 'bg-[#080c14] border-slate-800 text-slate-300'
                }`}
              >
                {obj.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span>{obj.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Controls Strip */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 p-4 flex justify-center">
        <div className="pointer-events-auto bg-[#0b101b]/90 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          {currentSpec.controls.map((ctrl) => (
            <span key={ctrl} className="font-mono text-slate-200">
              {ctrl}
            </span>
          ))}
          {step === 3 && !progress.step3Revived && (
            <span className="text-amber-400 font-semibold">
              İpucu: Aylin’in yanında F tuşuna 3 saniye basılı tut!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
