using System;

namespace PrintServer.Common;

/// <summary>
/// Parses the <c>--parent-pid</c> command-line argument used by both the
/// Windows and Linux PrintServer sidecars to identify the supervising process.
/// </summary>
/// <remarks>
/// Shared source file: compiled into both <c>PrintServer</c> and
/// <c>PrintServer.Linux</c> via an MSBuild <c>Compile</c> item so the parsing
/// logic has a single source of truth.
/// </remarks>
internal static class ParentPidParser
{
    /// <summary>
    /// Returns the parent process id encoded in <paramref name="args"/>, or
    /// <c>0</c> when the argument is absent or malformed.
    /// </summary>
    public static int Parse(string[] args)
    {
        const string flag = "--parent-pid";
        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (arg == flag && i + 1 < args.Length && int.TryParse(args[i + 1], out var next))
                return next;
            if (arg.StartsWith(flag + "=", StringComparison.OrdinalIgnoreCase) &&
                int.TryParse(arg[(flag.Length + 1)..], out var inline))
                return inline;
        }
        return 0;
    }
}
