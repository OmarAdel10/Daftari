using PrintServer.Common;
using Xunit;

namespace PrintServer.Tests;

public sealed class ParentPidParserTests
{
    [Fact]
    public void Parse_NoFlag_ReturnsZero()
    {
        Assert.Equal(0, ParentPidParser.Parse(Array.Empty<string>()));
        Assert.Equal(0, ParentPidParser.Parse(new[] { "--other", "1234" }));
    }

    [Fact]
    public void Parse_SeparatedValue_ReturnsParentPid()
    {
        Assert.Equal(1234, ParentPidParser.Parse(new[] { "--parent-pid", "1234" }));
    }

    [Fact]
    public void Parse_InlineValue_ReturnsParentPid()
    {
        Assert.Equal(1234, ParentPidParser.Parse(new[] { "--parent-pid=1234" }));
    }

    [Fact]
    public void Parse_InlineValue_IsCaseInsensitive()
    {
        Assert.Equal(1234, ParentPidParser.Parse(new[] { "--PARENT-PID=1234" }));
    }

    [Fact]
    public void Parse_SeparatedValue_IsCaseSensitive()
    {
        Assert.Equal(0, ParentPidParser.Parse(new[] { "--PARENT-PID", "1234" }));
    }

    [Fact]
    public void Parse_SeparatedFlagWithoutValue_ReturnsZero()
    {
        Assert.Equal(0, ParentPidParser.Parse(new[] { "--parent-pid" }));
    }

    [Fact]
    public void Parse_NonNumericValue_ReturnsZero()
    {
        Assert.Equal(0, ParentPidParser.Parse(new[] { "--parent-pid", "abc" }));
        Assert.Equal(0, ParentPidParser.Parse(new[] { "--parent-pid=abc" }));
    }

    [Fact]
    public void Parse_NegativeValue_IsParsedAndIgnoredByCallers()
    {
        // The parser returns the value verbatim; both hosts guard with
        // `if (parentPid > 0)`, so a negative pid disables the watcher.
        Assert.Equal(-5, ParentPidParser.Parse(new[] { "--parent-pid", "-5" }));
        Assert.Equal(-5, ParentPidParser.Parse(new[] { "--parent-pid=-5" }));
    }
}
