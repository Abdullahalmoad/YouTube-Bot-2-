import sys
import warnings
warnings.filterwarnings("ignore")
import librosa
import numpy as np

# يحلل مقطع صوتي ويحدد الجنس المرجح للمتكلم بناء على متوسط تردد النبرة (F0)
# نبرة عالية (> 175Hz) = بنت، نبرة واطية = ولد
def detect_gender(path):
    try:
        y, sr = librosa.load(path, sr=16000)
        if len(y) < sr * 0.15:
            return "male"  # مقطع قصير جدا، افتراضي ولد

        f0, voiced_flag, _ = librosa.pyin(
            y, fmin=65, fmax=400, sr=sr
        )
        f0 = f0[~np.isnan(f0)]
        if len(f0) == 0:
            return "male"

        median_f0 = float(np.median(f0))
        return "female" if median_f0 > 175 else "male"
    except Exception:
        return "male"  # عند أي خطأ، افتراضي ولد

if __name__ == "__main__":
    print(detect_gender(sys.argv[1]))
