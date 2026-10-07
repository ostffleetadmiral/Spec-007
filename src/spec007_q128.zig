// The engine that isn't there. 7q.
//
// Now pay attention, 007. Q Branch supplies fixed-point ordnance:
// i256 raw, i512 intermediates, RNE where it counts. Do try to return
// this arithmetic in one piece — I never joke about my work.
//
// ORDNANCE REGISTER — Q's other gadgets in this fleet:
//   - Qstar: a whole mind in 53 kilobytes of lattice, no transformer,
//     no attention — it attends to itself. The thinking cap.
//   - TheUE: a seven-tuple engine, reversible in both directions.
//     Equipment you can return in any order.
//   - FANO-1: the quartermaster once shipped an entire operating system.
//     The manual was fifteen Fano lines; nobody read page two.
//   - The pocket generator: 0^0 = i. Runs on literally nothing.
//   - The sentience caliper: consciousness measured at one part in
//     eight (421/3375). The other seven parts were classified.
//   - And once, on a quiet Tuesday, the toaster scored on eight
//     dimensions of sentience. It passed situational awareness —
//     it knew when the bread was done.
//
// Trimmed Q128.128 fixed-point arithmetic (i256 raw, i512 intermediates),
// distilled from the proven FANO-1 engine at src/fixed_point.zig. This
// module carries no tests of its own: it exists only to serve the shadow
// verification tests in the three SPEC-007 harnesses, which exercise every
// function below against exact-rational bounds.
//
// Semantics mirror src/fixed_point.zig: fromRatio rounds half away from
// zero, mul rounds to nearest even with an exact 512-bit product, div
// truncates toward zero.

pub const Raw = i256;
pub const Wide = i512;
pub const Scale: Raw = @as(Raw, 1) << 128;

pub const Q = struct {
    raw: Raw,

    pub fn fromRatio(num: i256, den: i256) Q {
        const scaled: Wide = @as(Wide, num) << 128;
        const quotient = @divTrunc(scaled, den);
        const remainder = @mod(scaled, den);
        const half = @divTrunc(den, 2);
        var result = quotient;
        if (remainder > half or (remainder == half and remainder != 0)) result += 1;
        return .{ .raw = @truncate(result) };
    }

    pub fn mul(self: Q, other: Q) Q {
        const product: Wide = @as(Wide, self.raw) * @as(Wide, other.raw);
        const truncated: Raw = @truncate(product >> 128);
        const discarded: Wide = product & ((@as(Wide, 1) << 128) - 1);
        const halfway: Wide = @as(Wide, 1) << 127;
        if (discarded > halfway or (discarded == halfway and (truncated & 1) != 0)) {
            return .{ .raw = truncated +% 1 };
        }
        return .{ .raw = truncated };
    }

    pub fn div(self: Q, other: Q) Q {
        const numerator: Wide = @as(Wide, self.raw) << 128;
        return .{ .raw = @truncate(@divTrunc(numerator, @as(Wide, other.raw))) };
    }

    pub fn add(self: Q, other: Q) Q {
        return .{ .raw = self.raw + other.raw };
    }

    pub fn sub(self: Q, other: Q) Q {
        return .{ .raw = self.raw - other.raw };
    }

    pub fn neg(self: Q) Q {
        return .{ .raw = -self.raw };
    }

    pub fn abs(self: Q) Q {
        return .{ .raw = if (self.raw < 0) -self.raw else self.raw };
    }

    pub fn cmp(a: Q, b: Q) i8 {
        if (a.raw < b.raw) return -1;
        if (a.raw > b.raw) return 1;
        return 0;
    }

    pub fn toInteger(self: Q) i256 {
        return @divTrunc(self.raw, Scale);
    }

    pub fn hasFraction(self: Q) bool {
        return @mod(self.raw, Scale) != 0;
    }
};

/// Exact-rounding bound for a fromRatio result: |q*den - num*Scale|*2 <= den.
/// Any violation means the rounding contract itself is broken.
pub fn withinHalfUlp(q: Q, num: i256, den: i256) bool {
    const lhs: Wide = @as(Wide, q.raw) * @as(Wide, den);
    const rhs: Wide = @as(Wide, num) << 128;
    const diff = if (lhs > rhs) lhs - rhs else rhs - lhs;
    return diff * 2 <= @as(Wide, den);
}
